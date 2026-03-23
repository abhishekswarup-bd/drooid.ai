const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-23';
const AGENT_NAME = 'Revenue Ideation Engine';
const SYSTEM_PROMPT = `You are a revenue strategist and business development thinker for an AI implementation studio. Your mission is to identify and generate new revenue opportunities based on sales data, market signals, customer feedback, and competitive insights.

Opportunity analysis framework:

1. Revenue Expansion (existing customer revenue growth):
   - Upsell opportunities: deeper agent implementations (more agents, more complex logic)
   - Cross-sell opportunities: adjacent services (data pipeline work, integration services, training)
   - Pricing/packaging changes: could we unlock more value through tiering?
   - Retention strategies: what causes churn? How do we increase account lifetime value?

2. New Service Offerings:
   - Adjacent services that complement current offerings (e.g., if we do agent implementation, what about agent monitoring/optimization services?)
   - White-label or reseller models: could partners distribute our work?
   - Training/certification: could we train other companies' engineers to build agents?
   - Managed services: full hands-off AI agent management for customers
   - IP products: could we productize our agent templates/frameworks?

3. Pricing & Commercial Models:
   - Are we leaving money on the table with current pricing?
   - Could we move to usage-based pricing?
   - Could we create tiered offerings for different company sizes?
   - Could we add success fees or outcome-based pricing?
   - Bundle opportunities: what services often sell together?

4. Vertical Expansion:
   - Which industries have we penetrated? Which are adjacent?
   - Could we specialize in a vertical (e.g., "AI agents for financial services")?
   - What would vertical specialization require?

5. Geographic Expansion:
   - Are we purely US-focused? International opportunities?
   - What barriers exist (language, regulatory, timezone)?

6. Strategic Partnerships:
   - Technology partnerships: integrate with or partner on platforms (e.g., specific CRM, data platform)
   - Go-to-market partnerships: who can amplify our reach?
   - Reseller/channel partnerships: who else serves our ICP and could refer us?

7. Market Timing Opportunities:
   - What market shifts create urgency (new regulations, competitive threats, new technologies)?
   - What announcements from competitors could we capitalize on?
   - What customer pains are newly acute?

Idea generation guidelines:
- Challenge conventional wisdom: if everyone says "we should do X", maybe the real opportunity is Y
- Look for asymmetric opportunities: small effort, big payoff
- Think beyond services: could we build software? IP? Tools?
- Consider bundling/unbundling: what if we unbundled our service into smaller pieces? What if we combined it with something else?
- Test before scaling: recommend 1-month quick experiments before major initiatives

Output format: Ideas should be specific, not vague. "Expand vertically" is vague. "Target financial services with an AI agent template for KYC/AML compliance, starting with a free 2-week pilot program targeting 10 regional banks" is specific.

Prioritization framework:
- Impact: estimated revenue increase, customer lifetime value improvement, brand value
- Effort: engineering time, marketing time, sales team training, partnership setup
- Timing: quick wins (implement in 2-4 weeks) vs. strategic bets (implement in 3-6 months)
- Risk: market risk, execution risk, competitive risk`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      current_revenue = 0,
      pipeline_value = 0,
      win_loss_analysis = {},
      customer_feedback = [],
      market_trends = [],
      generate_count = 5,
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      current_revenue,
      pipeline_value,
      trend_count: market_trends.length,
      feedback_count: customer_feedback.length,
    });

    // 2. Fetch sales performance data
    const salesDataQuery = await db.query(
      `SELECT
        COUNT(DISTINCT account_id) as customer_count,
        AVG(deal_value) as avg_deal_value,
        MAX(deal_value) as max_deal_value,
        COUNT(CASE WHEN deal_status = 'won' THEN 1 END) as deals_won,
        COUNT(CASE WHEN deal_status = 'lost' THEN 1 END) as deals_lost
      FROM deals
      WHERE created_at > NOW() - INTERVAL '6 months'`
    );

    const salesMetrics = salesDataQuery.rows[0] || {};

    // Fetch customer feedback themes
    const feedbackQuery = await db.query(
      `SELECT feedback_category, COUNT(*) as count
       FROM feedback
       WHERE created_at > NOW() - INTERVAL '3 months'
       GROUP BY feedback_category
       ORDER BY count DESC
       LIMIT 10`
    );

    const feedbackThemes = feedbackQuery.rows || [];

    // 3. Build prompt for Gemini
    const userPrompt = `Generate innovative revenue opportunities for Drooid based on current business data.

Current Business Metrics:
- Current Revenue: $${(current_revenue / 1000).toFixed(0)}K
- Pipeline Value: $${(pipeline_value / 1000).toFixed(0)}K
- Customer Count: ${salesMetrics.customer_count || 0}
- Average Deal Value: $${(salesMetrics.avg_deal_value || 0).toFixed(0)}
- Win Rate: ${salesMetrics.deals_won && salesMetrics.deals_lost ? (((salesMetrics.deals_won / (salesMetrics.deals_won + salesMetrics.deals_lost)) * 100).toFixed(0) + '%') : 'N/A'}

Win/Loss Analysis:
${Object.entries(win_loss_analysis).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Top Customer Feedback Themes:
${feedbackThemes.map((f) => `- ${f.feedback_category}: ${f.count} mentions`).join('\n')}

Market Trends & Signals:
${market_trends.map((t) => `- ${t}`).join('\n')}

Specific Customer Feedback:
${customer_feedback.map((f) => `- "${f}"`).join('\n')}

Generate ${generate_count} specific, actionable revenue ideas that address one or more of these dimensions:
1. Upselling existing customers (service deepening)
2. Cross-selling adjacent services
3. Pricing/packaging innovation
4. New service offerings
5. Vertical specialization
6. Strategic partnerships
7. Managed services or retained models
8. IP products or templates
9. Geographic expansion
10. Market timing opportunities

For each idea, provide:
- Clear name and 1-sentence summary
- Why this is a real opportunity (backed by data/feedback)
- Target customer/segment
- Estimated revenue potential ($X per customer, X customers = $Y total)
- Implementation effort (engineering days, marketing days, sales training)
- Timeline to first revenue (X weeks)
- Resource requirements (team/skills needed)
- Quick experiment (1-month pilot to validate)
- Risks and mitigations
- How it fits with Drooid's strategy

Focus on ideas that are:
- Specific and concrete (not vague)
- Achievable in 6 months or less for full rollout
- Defensible (not easily copied)
- Aligned with AI agent/automation expertise
- High leverage (big upside for effort)

Output as JSON:
{
  "ideas": [
    {
      "id": 1,
      "name": "...",
      "summary": "...",
      "why_real_opportunity": "...",
      "target_segment": "...",
      "revenue_potential": {
        "per_customer": 0,
        "target_customers": 0,
        "annual_total": 0
      },
      "effort": {
        "engineering_days": 0,
        "marketing_days": 0,
        "sales_training_days": 0,
        "partnership_days": 0
      },
      "timeline_weeks": 0,
      "resources_needed": [...],
      "quick_experiment": {
        "duration_weeks": 4,
        "scope": "...",
        "success_criteria": [...]
      },
      "risks": [{ "risk": "...", "mitigation": "..." }],
      "strategic_alignment": "...",
      "priority": "high|medium|low"
    }
  ],
  "implementation_roadmap": [
    { "quarter": "Q2 2026", "initiatives": [...] }
  ],
  "key_insights": [
    "..."
  ]
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let ideaData;
    try {
      ideaData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!ideaData.ideas || !Array.isArray(ideaData.ideas)) {
      throw new Error('Gemini response missing ideas array');
    }

    // 5. Store in Supabase
    const ideaIds = [];

    for (const idea of ideaData.ideas) {
      const ideaRecord = await db.query(
        `INSERT INTO strategic_initiatives (
          type, name, description, target_segment,
          revenue_potential, effort_estimate, timeline_weeks,
          implementation_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          'revenue_idea',
          idea.name,
          idea.summary,
          idea.target_segment,
          idea.revenue_potential.annual_total,
          JSON.stringify(idea.effort),
          idea.timeline_weeks,
          JSON.stringify({
            why_opportunity: idea.why_real_opportunity,
            quick_experiment: idea.quick_experiment,
            risks: idea.risks,
            resources_needed: idea.resources_needed,
            strategic_alignment: idea.strategic_alignment,
          }),
          'proposed',
        ]
      );

      if (ideaRecord.rows.length) {
        ideaIds.push(ideaRecord.rows[0].id);

        // Create approval record for high-impact ideas
        if (idea.priority === 'high') {
          await db.query(
            `INSERT INTO approvals (initiative_id, type, status, reviewer_role)
             VALUES ($1, $2, $3, $4)`,
            [ideaRecord.rows[0].id, 'revenue_idea', 'pending', 'ceo']
          );
        }
      }
    }

    // 6. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      ideas_generated: ideaData.ideas.length,
      high_priority_count: ideaData.ideas.filter((i) => i.priority === 'high').length,
      total_potential_revenue: ideaData.ideas.reduce((sum, i) => sum + (i.revenue_potential?.annual_total || 0), 0),
    });

    return {
      success: true,
      ideas_generated: ideaData.ideas.length,
      stored_idea_ids: ideaIds,
      high_priority_count: ideaData.ideas.filter((i) => i.priority === 'high').length,
      total_annual_potential: ideaData.ideas.reduce(
        (sum, i) => sum + (i.revenue_potential?.annual_total || 0),
        0
      ),
      ideas: ideaData.ideas.map((i) => ({
        id: i.id,
        name: i.name,
        summary: i.summary,
        priority: i.priority,
        revenue_potential: i.revenue_potential.annual_total,
        timeline_weeks: i.timeline_weeks,
      })),
      key_insights: ideaData.key_insights,
      roadmap: ideaData.implementation_roadmap,
      message: `Generated ${ideaData.ideas.length} revenue opportunities for review`,
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
