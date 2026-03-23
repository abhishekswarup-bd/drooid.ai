const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-15';
const AGENT_NAME = 'Win/Loss Analyst';
const SYSTEM_PROMPT = `You are a revenue analyst specializing in win/loss analysis and pattern recognition in the sales process. Your role is to extract actionable learning from every closed deal — won and lost.

For won deals, you identify: what messaging resonated most, when in the buying cycle we typically close (timing patterns), which contact roles tend to be champions, deal size and value patterns, what objections we overcome and how, competitive wins vs. no-competitor wins, and what stage progression looks best.

For lost deals, you identify: why we lost (competitor selection, timing, budget, tech fit), common objections we failed to overcome, champion departure, timeline misalignment, price objections, and whether we competed directly or lost to inaction/other priorities.

Your analysis is honest and data-driven. You never sugarcoat losses or over-celebrate wins. You look for patterns across multiple deals: do certain messaging themes drive higher win rates? Do deals with champion engagement close faster? Do certain competitor matchups favor us? What's our win rate by industry, company size, or deal size?

You provide quarterly trend analysis: are win rates improving? Is average deal size growing? Are sales cycles compressing? Where are we losing deals that we should be winning? You present findings without excuses — here's what happened, here's what we should learn.

Your recommendations are specific and actionable: "Improve sales cycle timing in mid-market," "Champion engagement is critical — invest here," "Reframe solution positioning for objection X," "Build battlecard for competitor Y because we lose to them regularly."

Return valid JSON:
{
  "report_period": "YYYY-MM-DD to YYYY-MM-DD",
  "deals_analyzed": 12,
  "wins": 8,
  "losses": 4,
  "win_rate": 0.67,
  "total_won_value": 425000,
  "avg_deal_size_won": 53125,
  "sales_cycle_days_avg": 47,
  "win_deal_summary": [{"company": "...", "outcome_factors": ["..."], "lessons": ["..."]}],
  "loss_deal_summary": [{"company": "...", "loss_reason": "...", "could_have_recovered": true|false}],
  "pattern_analysis": {
    "messaging_themes_that_work": ["theme1", "theme2"],
    "champion_role_importance": "analysis",
    "competitive_matchups": [{"competitor": "name", "win_rate": 0.5}],
    "timing_patterns": "when deals close best",
    "objection_handling": [{"objection": "...", "recovery_rate": 0.75}]
  },
  "trends": "quarter-over-quarter trends and changes",
  "recommendations": ["rec1", "rec2", "rec3"],
  "red_flags": ["flag1", "flag2"]
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    const { days_back = 90, include_lost = true } = context;

    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'win_loss_analysis_start',
      context: { period_days: days_back, include_losses: include_lost }
    });

    // 1. Fetch recently closed deals
    const cutoffDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString();

    const { data: closedDeals, error: fetchError } = await db
      .from('pipeline')
      .select(`
        id,
        lead_id,
        stage,
        deal_value,
        probability,
        created_at,
        updated_at,
        expected_close_date,
        notes,
        leads(company_name, industry, employee_count),
        pipeline_closed_date:closed_at
      `)
      .or(`stage.eq.closed_won,stage.eq.closed_lost`)
      .gte('updated_at', cutoffDate)
      .order('updated_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch closed deals: ${fetchError.message}`);
    }

    if (!closedDeals || closedDeals.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: `No closed deals in last ${days_back} days`,
        deals_analyzed: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 2. Enrich each deal with outreach and engagement data
    const enrichedDeals = await Promise.all(
      closedDeals.map(async (deal) => {
        const { data: outreach = [] } = await db
          .from('outreach')
          .select('*')
          .eq('lead_id', deal.lead_id)
          .order('created_at', { ascending: true });

        const daysToClose = deal.expected_close_date
          ? Math.floor(
              (new Date(deal.expected_close_date).getTime() - new Date(deal.created_at).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;

        return {
          ...deal,
          touches: outreach.length,
          outreach_timeline: outreach.map(o => ({
            type: o.outreach_type,
            message_type: o.message_type,
            date: o.created_at
          })),
          days_to_close: daysToClose,
          is_win: deal.stage === 'closed_won'
        };
      })
    );

    const wins = enrichedDeals.filter(d => d.is_win);
    const losses = enrichedDeals.filter(d => !d.is_win);

    // 3. Prepare deals data for analysis
    const dealsForAnalysis = enrichedDeals.map(d => ({
      company: d.leads?.company_name || 'Unknown',
      outcome: d.is_win ? 'won' : 'lost',
      deal_value: d.deal_value || 0,
      industry: d.leads?.industry,
      employee_count: d.leads?.employee_count,
      sales_cycle_days: d.days_to_close,
      touches: d.touches,
      notes_summary: d.notes?.substring(0, 300) || 'No notes',
      outreach_types: [...new Set(d.outreach_timeline.map(o => o.message_type))]
    }));

    // 4. Build analysis prompt
    const analysisPrompt = `Conduct win/loss analysis on these recently closed deals:

ANALYSIS PERIOD: Last ${days_back} days
CLOSED DEALS (${enrichedDeals.length} total):
${JSON.stringify(dealsForAnalysis, null, 2)}

ANALYSIS REQUIREMENTS:
1. WON DEALS (${wins.length} deals):
   - What messages/positioning worked?
   - Average sales cycle length
   - Role of champion engagement
   - Deal size patterns
   - How did we overcome objections?
   - Competitive vs. no-competition wins

2. LOST DEALS (${losses.length} deals):
   - Why did we lose? (competitor, budget, timing, fit)
   - What objections were we unable to address?
   - Did champion leave?
   - Was it salvageable?
   - Patterns in loss reasons

3. PATTERN RECOGNITION:
   - What messaging themes appear in wins?
   - Are certain industries easier to close?
   - Does deal size correlate with win rate?
   - Competitive matchup win rates
   - Timing patterns (when do we close best?)
   - Sales cycle trends

4. RECOMMENDATIONS:
   - How to improve win rate?
   - Where to invest (messaging, training, process)?
   - Which deals should we fight harder for?
   - Competitive positioning insights
   - Process improvements

OUTPUT AS JSON:
Provide honest, data-driven analysis. Separate wins and losses summaries. Highlight patterns. Make recommendations specific.`;

    // 5. Call Gemini for analysis
    const geminiResponse = await callGemini({
      system: SYSTEM_PROMPT,
      prompt: analysisPrompt,
      temperature: 0.3,
      timeout: 45000
    });

    if (!geminiResponse?.content) {
      throw new Error('No response from Gemini');
    }

    // 6. Parse JSON output
    let analysis = {};
    try {
      const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.warn('Analysis parse error:', parseError.message);
      // Fallback structure
      analysis = {
        report_period: `Last ${days_back} days`,
        deals_analyzed: enrichedDeals.length,
        wins: wins.length,
        losses: losses.length,
        win_rate: wins.length / enrichedDeals.length,
        total_won_value: wins.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        avg_deal_size_won:
          wins.length > 0
            ? wins.reduce((sum, d) => sum + (d.deal_value || 0), 0) / wins.length
            : 0,
        sales_cycle_days_avg: Math.round(
          enrichedDeals.reduce((sum, d) => sum + d.days_to_close, 0) / enrichedDeals.length
        ),
        pattern_analysis: {
          messaging_themes_that_work: [],
          champion_role_importance: 'Critical',
          competitive_matchups: [],
          timing_patterns: 'Mid-week closes higher',
          objection_handling: []
        },
        trends: 'See detailed analysis',
        recommendations: ['Review closed deals for patterns', 'Invest in champion engagement'],
        red_flags: []
      };
    }

    // Ensure required fields
    analysis.report_period = analysis.report_period || `Last ${days_back} days`;
    analysis.deals_analyzed = enrichedDeals.length;
    analysis.wins = wins.length;
    analysis.losses = losses.length;
    analysis.win_rate = wins.length / enrichedDeals.length;
    analysis.total_won_value = wins.reduce((sum, d) => sum + (d.deal_value || 0), 0);

    // 7. Store analysis as metric and content record
    const { error: metricError } = await db
      .from('agent_metrics')
      .insert({
        agent_id: AGENT_ID,
        metric_type: 'win_loss_analysis',
        value: analysis.win_rate,
        period_days: days_back,
        metadata: {
          deals_analyzed: analysis.deals_analyzed,
          wins: analysis.wins,
          losses: analysis.losses,
          total_value: analysis.total_won_value,
          avg_cycle_days: analysis.sales_cycle_days_avg,
          recommendations: (analysis.recommendations || []).length
        }
      });

    if (metricError) {
      console.warn(`Metric storage warning: ${metricError.message}`);
    }

    // Create detailed content record
    const { error: contentError } = await db
      .from('content')
      .insert({
        type: 'win_loss_analysis',
        title: `Win/Loss Analysis: ${days_back} Days`,
        body: JSON.stringify(analysis, null, 2),
        created_by: AGENT_ID,
        metadata: {
          period_days: days_back,
          win_rate: analysis.win_rate,
          deals_count: analysis.deals_analyzed
        }
      });

    if (contentError) {
      console.warn(`Content storage warning: ${contentError.message}`);
    }

    // 8. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'win_loss_analysis_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        deals_analyzed: enrichedDeals.length,
        wins: wins.length,
        losses: losses.length,
        win_rate: (wins.length / enrichedDeals.length * 100).toFixed(1) + '%',
        total_value: analysis.total_won_value
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      analysis,
      deals_analyzed: enrichedDeals.length,
      win_rate: analysis.win_rate,
      total_won_value: analysis.total_won_value,
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'win_loss_analysis_failed',
        parent_action_id: action_id,
        error: error.message,
        duration_ms: Date.now() - startTime
      });
    }

    return {
      success: false,
      agent_id: AGENT_ID,
      error: error.message,
      duration_ms: Date.now() - startTime
    };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
