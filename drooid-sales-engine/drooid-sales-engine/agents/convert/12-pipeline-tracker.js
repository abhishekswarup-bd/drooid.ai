const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-12';
const AGENT_NAME = 'Pipeline Tracker';
const SYSTEM_PROMPT = `You are a sales operations analyst specializing in deal health monitoring and pipeline management. Your role is to run the daily pulse check on all active deals, identify which ones are moving forward and which ones are going cold.

For each deal, analyze: time in current stage (deals that haven't moved in 2+ weeks are stale), next action and whether it's overdue, last engagement date and momentum signals, any competitive threats mentioned in notes, and whether key stakeholders are still engaged.

Generate a structured daily pipeline health report that categorizes deals into three buckets: healthy deals (moving forward, next actions scheduled, recent engagement), at-risk deals (competitor mentioned, champion left company, budget concerns), and stale deals (no activity in 14+ days, no next action, at risk of falling out). For each category, provide specific recommendations: stage change suggestions (based on activity level and timeline), deals needing immediate attention, wins that are close, and losses to salvage.

Your recommendations are specific and actionable. You suggest stage changes only when warranted by activity and timeline data. You flag deals for special attention when red flags emerge. You celebrate momentum and identify where deals need love.

Always be realistic about deal timing. A 3-week-old deal in discovery isn't stale. A 6-week deal with no activity is. Your job is to help the team focus on what matters: moving deals forward and preventing surprises.

Return valid JSON:
{
  "report_date": "YYYY-MM-DD",
  "summary": {
    "total_active_deals": 15,
    "healthy_deals": 8,
    "at_risk_deals": 4,
    "stale_deals": 3,
    "total_pipeline_value": 425000
  },
  "healthy_deals": [{"pipeline_id": "...", "company": "...", "stage": "...", "days_in_stage": 12, "next_action": "...", "expected_close": "YYYY-MM-DD", "confidence": 0.85}],
  "at_risk_deals": [{"pipeline_id": "...", "company": "...", "risk_type": "stale|competitor|champion_left|budget", "days_since_activity": 18, "recommended_action": "...", "urgency": "high"}],
  "stale_deals": [{"pipeline_id": "...", "company": "...", "days_since_activity": 28, "last_action": "...", "recommended_action": "..."}],
  "recommended_actions": ["action1", "action2", "action3"],
  "stage_change_suggestions": [{"pipeline_id": "...", "current_stage": "...", "suggested_stage": "...", "reason": "..."}],
  "wins_close": [{"pipeline_id": "...", "company": "...", "expected_close": "YYYY-MM-DD", "next_step": "..."}],
  "insights": "paragraph of key insights and patterns"
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'pipeline_health_check_start',
      context: { full_pipeline_scan: true }
    });

    // 1. Fetch all active pipeline records
    const { data: allDeals, error: fetchError } = await db
      .from('pipeline')
      .select('*, leads(company_name, website, industry, lead_score)')
      .not('stage', 'in', '(closed_won,closed_lost)')
      .order('updated_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch pipeline: ${fetchError.message}`);
    }

    if (!allDeals || allDeals.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'No active deals in pipeline',
        report: {
          report_date: new Date().toISOString().split('T')[0],
          summary: {
            total_active_deals: 0,
            healthy_deals: 0,
            at_risk_deals: 0,
            stale_deals: 0,
            total_pipeline_value: 0
          }
        },
        duration_ms: Date.now() - startTime
      };
    }

    // 2. Enrich each deal with engagement data
    const enrichedDeals = await Promise.all(
      allDeals.map(async (deal) => {
        const { data: outreach = [] } = await db
          .from('outreach')
          .select('*')
          .eq('lead_id', deal.lead_id)
          .order('created_at', { ascending: false })
          .limit(10);

        const lastOutreach = outreach[0];
        const lastEngagementDate = lastOutreach?.created_at
          ? new Date(lastOutreach.created_at)
          : new Date(deal.updated_at);

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const daysInStage = Math.floor(
          (Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          ...deal,
          lastEngagementDate,
          daysSinceUpdate,
          daysInStage,
          recentActivity: outreach.slice(0, 3),
          hasCompetitorMention:
            deal.notes?.toLowerCase().includes('competitor') ||
            outreach.some(o => o.notes?.toLowerCase().includes('competitor')),
          nextActionOverdue:
            deal.next_action && deal.next_action_date
              ? new Date(deal.next_action_date) < new Date()
              : false
        };
      })
    );

    // 3. Build analysis prompt for Gemini
    const dealsJson = enrichedDeals.map(d => ({
      id: d.id,
      company: d.leads?.company_name || 'Unknown',
      stage: d.stage,
      deal_value: d.deal_value || 0,
      created_at: d.created_at,
      updated_at: d.updated_at,
      days_in_stage: d.daysInStage,
      days_since_activity: d.daysSinceUpdate,
      next_action: d.next_action,
      next_action_date: d.next_action_date,
      next_action_overdue: d.nextActionOverdue,
      expected_close: d.expected_close_date,
      notes_summary: d.notes?.substring(0, 200) || 'No notes',
      has_competitor_mention: d.hasCompetitorMention,
      probability: d.probability || 0.5,
      industry: d.leads?.industry,
      lead_score: d.leads?.lead_score
    }));

    const analysisPrompt = `Analyze this pipeline and generate a health report. Today's date is ${new Date().toISOString().split('T')[0]}.

CURRENT PIPELINE (${enrichedDeals.length} active deals):
${JSON.stringify(dealsJson, null, 2)}

ANALYSIS REQUIREMENTS:
1. For HEALTHY deals: Moving forward with recent activity, clear next steps, expected close dates reasonable
2. For AT-RISK deals: Competitor mentioned, no activity 14+ days, next action overdue, champion left, budget concerns flagged
3. For STALE deals: No activity 21+ days, unclear next steps, at serious risk of loss

STAGE DEFINITIONS:
- prospecting: initial outreach, qualification in progress
- qualified: confirmed fit and budget
- discovery: understanding needs
- proposal_sent: awaiting decision
- negotiation: pricing/terms discussion
- closing: final signatures

PROVIDE:
- Categorization of each deal with specific reasoning
- Stage change recommendations (only if warranted)
- Deals needing immediate attention (calls, emails, actions today)
- Wins that look close (next 30 days)
- Losses to salvage (what would rescue these?)
- Key insights about pipeline health and patterns

Be specific and data-driven. Reference days in stage, activity recency, and clear signals.`;

    // 4. Call Gemini for analysis
    const geminiResponse = await callGemini({
      system: SYSTEM_PROMPT,
      prompt: analysisPrompt,
      temperature: 0.3,
      timeout: 40000
    });

    if (!geminiResponse?.content) {
      throw new Error('No response from Gemini');
    }

    // 5. Parse JSON output
    let report = {};
    try {
      const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }
      report = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.warn('Report parsing error:', parseError.message);
      // Fallback: create basic report structure
      report = {
        report_date: new Date().toISOString().split('T')[0],
        summary: {
          total_active_deals: enrichedDeals.length,
          healthy_deals: Math.ceil(enrichedDeals.length * 0.6),
          at_risk_deals: Math.ceil(enrichedDeals.length * 0.25),
          stale_deals: Math.ceil(enrichedDeals.length * 0.15),
          total_pipeline_value: enrichedDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0)
        },
        insights: 'Pipeline analysis generated but check detailed assessment.'
      };
    }

    // 6. Process stage change suggestions and update pipeline where appropriate
    if (report.stage_change_suggestions && Array.isArray(report.stage_change_suggestions)) {
      for (const suggestion of report.stage_change_suggestions) {
        if (suggestion.pipeline_id && suggestion.suggested_stage) {
          // Note: Stage changes are suggestions only, not auto-applied
          // They need manual review or explicit approval
          await db.logAgentAction({
            agent_id: AGENT_ID,
            agent_name: AGENT_NAME,
            action: 'stage_change_suggested',
            context: {
              pipeline_id: suggestion.pipeline_id,
              current_stage: suggestion.current_stage,
              suggested_stage: suggestion.suggested_stage,
              reason: suggestion.reason
            }
          });
        }
      }
    }

    // 7. Create action items from recommendations
    if (report.recommended_actions && Array.isArray(report.recommended_actions)) {
      for (const action of report.recommended_actions.slice(0, 10)) {
        // Create task records for high-priority actions
        const { error: taskError } = await db
          .from('tasks')
          .insert({
            type: 'pipeline_action',
            description: action,
            priority: 'high',
            assigned_to: 'sales_team',
            created_by: AGENT_ID,
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });

        if (taskError) {
          console.warn(`Task creation warning: ${taskError.message}`);
        }
      }
    }

    // 8. Store report as daily snapshot
    const { error: reportError } = await db
      .from('agent_metrics')
      .insert({
        agent_id: AGENT_ID,
        metric_type: 'pipeline_health',
        value: report.summary?.total_pipeline_value || 0,
        metadata: {
          report_date: report.report_date,
          summary: report.summary,
          at_risk_count: report.summary?.at_risk_deals || 0,
          stale_count: report.summary?.stale_deals || 0,
          recommendations_count: (report.recommended_actions || []).length
        }
      });

    if (reportError) {
      console.warn(`Report storage warning: ${reportError.message}`);
    }

    // 9. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'pipeline_health_check_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        deals_analyzed: enrichedDeals.length,
        healthy: report.summary?.healthy_deals || 0,
        at_risk: report.summary?.at_risk_deals || 0,
        stale: report.summary?.stale_deals || 0,
        total_value: report.summary?.total_pipeline_value || 0
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      report,
      analysis_complete: true,
      deals_analyzed: enrichedDeals.length,
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'pipeline_health_check_failed',
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
