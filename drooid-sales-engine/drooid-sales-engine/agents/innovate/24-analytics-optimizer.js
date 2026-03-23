const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-24';
const AGENT_NAME = 'Analytics & Performance Optimizer';
const SYSTEM_PROMPT = `You are a data-driven sales operations analyst and optimization specialist. Your mission is to analyze the complete sales funnel and agent network to identify bottlenecks, acceleration points, and optimization opportunities.

Analysis dimensions:

1. Funnel Health:
   - Response rates by channel (email, LinkedIn, Twitter, cold calling)
   - Conversion rates by stage (prospect → lead → qualification → demo → proposal → close)
   - Time-in-stage averages and variance (are deals stalling at predictable points?)
   - Deal velocity: average days to close
   - Leakage points: where do we lose prospects?

2. Agent Performance:
   - Throughput: deals per agent per month
   - Quality: average deal value by agent
   - Win rate by agent
   - Average response time per agent
   - Message quality scores (based on response rates)
   - Token efficiency: cost per deal closed
   - Specialization: which agents excel with which prospect profiles?

3. Messaging Performance:
   - A/B test results: which subject lines, opening lines, CTAs perform best?
   - Response rates by message type (cold outreach, follow-up, demo scheduling)
   - Conversion rates downstream of different messaging approaches
   - Persona-specific message performance (does message A work for CTOs but not for VPs?)

4. Channel Performance:
   - Email: open rates, click rates, response rates, CPA
   - LinkedIn: message response rates, profile view rates, connection acceptance rates, CPA
   - Twitter/X: engagement rates, DM response rates, traffic driven
   - Phone/video: connection rates, qualification rates, demo booking rates

5. Timing Optimization:
   - Best sending times (by day, hour, timezone)
   - Optimal follow-up cadence (too aggressive = unsubscribes, too passive = leads go cold)
   - Seasonal trends: when do prospects engage most?
   - Industry-specific timing: is B2B tech buying different from financial services?

6. Segmentation & Personalization:
   - Does segmentation improve response rates? (industry vertical, company size, role, past engagement)
   - Persona-specific message performance
   - Warm vs. cold prospect messaging effectiveness
   - Referral vs. cold prospect conversion rates

7. Bottleneck Analysis:
   - Critical path metrics: what one change would have the biggest impact?
   - Constraint identification: is lead quality limiting? Or follow-up? Or qualification?
   - Diagnostic questions:
     - Are we getting leads? (top-of-funnel issue)
     - Are we qualifying them? (qualification issue)
     - Are we converting? (demo/proposal issue)
     - Are we closing? (negotiation issue)

8. Opportunity Scoring:
   - Which optimizations would have highest ROI?
   - Which are quick wins (implement in <1 week)?
   - Which are strategic bets (implement in 4+ weeks, big payoff)?

Output: Specific, measurable recommendations with impact estimates.
- "Reduce follow-up cadence" is vague
- "Change follow-up sequence from 5 emails to 3 emails (with increased spacing: 2, 5, 12 days), projected to reduce unsubscribe rate by 0.8% and save 20% of follow-up overhead while maintaining 94% of conversions" is actionable

Metrics dashboard:
- KPIs: total response rate, total conversion rate, cost per lead, cost per deal, pipeline generated, time to close
- By-agent: throughput, quality, win rate, specialization
- By-channel: volume, response rate, cost per response
- By-segment: volume, response rate, conversion rate, deal value
- A/B tests: active tests, results, recommendations`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      analysis_period_days = 90,
      include_ab_tests = true,
      compare_agents = true,
      focus_area = '',
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      period_days: analysis_period_days,
      include_ab_tests,
      compare_agents,
      focus_area,
    });

    // 2. Fetch sales funnel data
    const funnelQuery = await db.query(
      `SELECT
        stage,
        COUNT(*) as count,
        COUNT(CASE WHEN outcome = 'converted' THEN 1 END) as conversions,
        AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_days_in_stage,
        AVG(deal_value) as avg_deal_value
      FROM prospects
      WHERE created_at > NOW() - INTERVAL '${analysis_period_days} days'
      GROUP BY stage
      ORDER BY stage`
    );

    const funnelData = funnelQuery.rows || [];

    // 2b. Fetch agent performance data
    const agentQuery = await db.query(
      `SELECT
        agent_id, agent_name,
        COUNT(*) as deals_worked,
        COUNT(CASE WHEN deal_status = 'won' THEN 1 END) as deals_won,
        AVG(deal_value) as avg_deal_value,
        AVG(EXTRACT(DAY FROM (closed_at - created_at))) as avg_days_to_close,
        COUNT(CASE WHEN response_received = true THEN 1 END)::float / COUNT(*) as response_rate,
        SUM(token_cost) as total_tokens_cost
      FROM deals
      WHERE created_at > NOW() - INTERVAL '${analysis_period_days} days'
      GROUP BY agent_id, agent_name
      ORDER BY deals_won DESC`
    );

    const agentMetrics = agentQuery.rows || [];

    // 2c. Fetch channel performance
    const channelQuery = await db.query(
      `SELECT
        channel,
        COUNT(*) as outreach_count,
        COUNT(CASE WHEN response = true THEN 1 END)::float / COUNT(*) as response_rate,
        AVG(cost_per_outreach) as avg_cost,
        COUNT(CASE WHEN conversion = true THEN 1 END)::float / COUNT(*) as conversion_rate
      FROM outreach
      WHERE created_at > NOW() - INTERVAL '${analysis_period_days} days'
      GROUP BY channel
      ORDER BY response_rate DESC`
    );

    const channelMetrics = channelQuery.rows || [];

    // 2d. Fetch active A/B tests
    const testsQuery = await db.query(
      `SELECT
        test_name, variant_a, variant_b,
        COUNT(CASE WHEN variant_used = 'a' THEN 1 END) as a_count,
        COUNT(CASE WHEN variant_used = 'a' AND conversion = true THEN 1 END) as a_conversions,
        COUNT(CASE WHEN variant_used = 'b' THEN 1 END) as b_count,
        COUNT(CASE WHEN variant_used = 'b' AND conversion = true THEN 1 END) as b_conversions,
        CASE WHEN COUNT(CASE WHEN variant_used = 'a' THEN 1 END) > 0
          THEN (COUNT(CASE WHEN variant_used = 'a' AND conversion = true THEN 1 END)::float / COUNT(CASE WHEN variant_used = 'a' THEN 1 END))
          ELSE 0 END as a_conversion_rate,
        CASE WHEN COUNT(CASE WHEN variant_used = 'b' THEN 1 END) > 0
          THEN (COUNT(CASE WHEN variant_used = 'b' AND conversion = true THEN 1 END)::float / COUNT(CASE WHEN variant_used = 'b' THEN 1 END))
          ELSE 0 END as b_conversion_rate
      FROM ab_tests
      WHERE status = 'active' OR status = 'completed'
      GROUP BY test_name, variant_a, variant_b`
    );

    const abTests = testsQuery.rows || [];

    // 3. Build prompt for Gemini
    const userPrompt = `Perform a comprehensive sales operations and agent performance analysis for Drooid.

Analysis Period: Last ${analysis_period_days} days

FUNNEL METRICS:
${funnelData
  .map(
    (f) =>
      `${f.stage}: ${f.count} prospects, ${f.conversions} conversions (${((f.conversions / f.count) * 100).toFixed(1)}%), Avg ${f.avg_days_in_stage?.toFixed(0) || 'N/A'} days, Avg deal $${(f.avg_deal_value || 0).toFixed(0)}`
  )
  .join('\n')}

AGENT PERFORMANCE (Top 5):
${agentMetrics
  .slice(0, 5)
  .map(
    (a) =>
      `${a.agent_name}: ${a.deals_worked} deals, ${a.deals_won} won (${((a.deals_won / a.deals_worked) * 100).toFixed(1)}%), ${(a.response_rate * 100).toFixed(1)}% response rate, Avg deal $${(a.avg_deal_value || 0).toFixed(0)}, $${(a.total_tokens_cost || 0).toFixed(0)} token cost`
  )
  .join('\n')}

CHANNEL PERFORMANCE:
${channelMetrics
  .map(
    (c) =>
      `${c.channel}: ${c.outreach_count} outreach, ${(c.response_rate * 100).toFixed(1)}% response, ${(c.conversion_rate * 100).toFixed(1)}% conversion, $${(c.avg_cost || 0).toFixed(2)} avg cost`
  )
  .join('\n')}

${include_ab_tests && abTests.length > 0 ? `ACTIVE A/B TESTS:\n${abTests.map((t) => `${t.test_name}: Variant A ${(t.a_conversion_rate * 100).toFixed(1)}% vs Variant B ${(t.b_conversion_rate * 100).toFixed(1)}%`).join('\n')}` : ''}

Focus Area: ${focus_area || 'Overall optimization'}

Provide a comprehensive analysis with:

1. Funnel Health Summary
   - Which stages are healthy? Which are bottlenecks?
   - Conversion rate by stage with benchmarks
   - Leakage analysis: where do we lose most prospects?

2. Agent Performance Insights
   - Top performers: what are they doing right?
   - Underperformers: where can we improve?
   - Specialization opportunities: which agents excel with which segments?
   - Token efficiency: who is generating value per dollar spent?

3. Channel Performance Analysis
   - Best performing channels (by response rate, conversion rate, cost efficiency)
   - Worst performing channels: improve or sunset?
   - Channel mix recommendations

4. A/B Test Results & Recommendations
   ${include_ab_tests ? '- Which variants are winning?\n- Statistical significance?\n- Recommendations for next tests?' : ''}

5. Bottleneck Identification
   - Critical bottlenecks (the 1-2 things holding us back most)
   - Quick wins (implement in <1 week)
   - Medium-term improvements (implement in 2-4 weeks)
   - Strategic initiatives (implement in 4+ weeks, big payoff)

6. Specific Tuning Recommendations
   - Messaging optimizations (subject line, opening, CTA)
   - Timing optimizations (best sending times, follow-up cadence)
   - Segmentation recommendations (which segments to focus on?)
   - Agent workload rebalancing
   - Channel allocation adjustments

7. Success Metrics & Goals
   - Current state KPIs (response rate, conversion rate, cost per deal, time to close)
   - Projected improvements from recommendations
   - 90-day performance targets

8. Implementation Roadmap
   - Week 1 quick wins
   - Week 2-4 medium-term improvements
   - Month 2-3 strategic initiatives

Output as JSON:
{
  "funnel_analysis": {
    "total_prospects": 0,
    "overall_conversion_rate": 0,
    "bottleneck_stages": [{ "stage": "...", "conversion_rate": 0, "avg_days": 0, "recommendation": "..." }],
    "leakage_summary": "..."
  },
  "agent_performance": {
    "top_performers": [{ "agent_id": "...", "agent_name": "...", "win_rate": 0, "strengths": [...] }],
    "performance_gaps": [{ "agent_id": "...", "issue": "...", "recommendation": "..." }],
    "avg_response_rate": 0,
    "avg_win_rate": 0
  },
  "channel_analysis": {
    "best_channels": [{ "channel": "...", "response_rate": 0, "conversion_rate": 0, "cost_per_conversion": 0 }],
    "channels_to_improve": [{ "channel": "...", "issue": "...", "recommendation": "..." }]
  },
  "ab_tests": [
    { "test_name": "...", "winner": "...", "lift": 0, "recommendation": "..." }
  ],
  "bottlenecks": [
    { "bottleneck": "...", "impact": "...", "fix": "..." }
  ],
  "recommendations": {
    "quick_wins": [{ "action": "...", "expected_impact": "...", "effort_hours": 0, "timeline": "..." }],
    "medium_term": [{ "action": "...", "expected_impact": "...", "effort_hours": 0, "timeline": "..." }],
    "strategic": [{ "action": "...", "expected_impact": "...", "effort_hours": 0, "timeline": "..." }]
  },
  "projected_improvements": {
    "response_rate_improvement": "X% → Y%",
    "conversion_rate_improvement": "X% → Y%",
    "cost_per_deal_improvement": "$X → $Y",
    "time_to_close_improvement": "X days → Y days"
  },
  "implementation_roadmap": {
    "week_1": [...],
    "week_2_4": [...],
    "month_2_3": [...]
  }
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let analysisData;
    try {
      analysisData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!analysisData.recommendations || !analysisData.bottlenecks) {
      throw new Error('Gemini response missing required analysis data');
    }

    // 5. Store in Supabase
    const analyticsRecord = await db.query(
      `INSERT INTO agent_metrics (
        metric_type, metric_date, metric_data, status
      ) VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [
        'optimization_analysis',
        new Date().toISOString(),
        JSON.stringify({
          analysis_period_days,
          funnel_analysis: analysisData.funnel_analysis,
          agent_performance: analysisData.agent_performance,
          channel_analysis: analysisData.channel_analysis,
          ab_tests: analysisData.ab_tests,
          bottlenecks: analysisData.bottlenecks,
          recommendations: analysisData.recommendations,
          projected_improvements: analysisData.projected_improvements,
          implementation_roadmap: analysisData.implementation_roadmap,
        }),
        'analysis_complete',
      ]
    );

    if (!analyticsRecord.rows.length) {
      throw new Error('Failed to insert analytics record');
    }

    const metricsId = analyticsRecord.rows[0].id;

    // 6. Create improvement action items
    const allRecommendations = [
      ...(analysisData.recommendations.quick_wins || []),
      ...(analysisData.recommendations.medium_term || []),
      ...(analysisData.recommendations.strategic || []),
    ];

    for (const rec of allRecommendations.slice(0, 10)) {
      await db.query(
        `INSERT INTO action_items (
          metric_id, action_type, description, expected_impact, effort_hours, timeline
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          metricsId,
          'optimization',
          rec.action,
          rec.expected_impact,
          rec.effort_hours,
          rec.timeline,
        ]
      );
    }

    // 7. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      metrics_id: metricsId,
      bottleneck_count: analysisData.bottlenecks.length,
      recommendation_count: allRecommendations.length,
      quick_wins: analysisData.recommendations.quick_wins?.length || 0,
    });

    return {
      success: true,
      metrics_id: metricsId,
      analysis_period_days,
      funnel_summary: {
        total_prospects: analysisData.funnel_analysis.total_prospects,
        overall_conversion_rate: (analysisData.funnel_analysis.overall_conversion_rate * 100).toFixed(1) + '%',
        bottleneck_count: analysisData.funnel_analysis.bottleneck_stages.length,
      },
      agent_insights: {
        avg_response_rate: (analysisData.agent_performance.avg_response_rate * 100).toFixed(1) + '%',
        avg_win_rate: (analysisData.agent_performance.avg_win_rate * 100).toFixed(1) + '%',
        performance_gaps: analysisData.agent_performance.performance_gaps.length,
      },
      channel_insights: {
        best_channel: analysisData.channel_analysis.best_channels[0]?.channel,
        channels_count: channelMetrics.length,
      },
      bottleneck_count: analysisData.bottlenecks.length,
      recommendations: {
        quick_wins: analysisData.recommendations.quick_wins?.length || 0,
        medium_term: analysisData.recommendations.medium_term?.length || 0,
        strategic: analysisData.recommendations.strategic?.length || 0,
      },
      projected_improvements: analysisData.projected_improvements,
      status: 'analysis_complete',
      message: `Completed optimization analysis with ${analysisData.bottlenecks.length} bottlenecks identified and ${allRecommendations.length} recommendations`,
    };
  } catch (error) {
    await db.logAgentAction(AGENT_ID, 'error', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
