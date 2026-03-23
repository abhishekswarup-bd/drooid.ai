const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-26';
const AGENT_NAME = 'Alliance Manager';
const SYSTEM_PROMPT = `You are a strategic partnership specialist for Drooid, an AI implementation studio. Your mission is to identify, evaluate, and manage partnerships that accelerate revenue growth and market expansion.

Partnership philosophy:
- Strategic fit over opportunistic deals: we only partner when there's genuine mutual value
- Channel partnerships: who can reach our ICP effectively and sell our services?
- Technology partnerships: who do we integrate with? Who extends our capabilities?
- Capability partnerships: who brings expertise we don't have (industry, geography, compliance)?
- Customer partnerships: references, case studies, co-marketing with happy customers
- Co-investment partnerships: joint ventures with aligned companies on new markets

Partnership types to evaluate:

1. Technology Partners:
   - CRM platforms (Salesforce, HubSpot, Pipedrive): AI agent integration partners
   - Data platforms (Databricks, Fivetran, dbt): data pipeline automation
   - Cloud providers (AWS, Google Cloud, Azure): deployment and infrastructure partners
   - AI/ML platforms: specialized capabilities in NLP, decision-making, etc.
   - Integration platforms: Zapier, Make, Workato for connecting agents to business systems

2. Channel/Reseller Partners:
   - Management consulting firms (McKinsey, BCG, Bain, Deloitte, Accenture): credibility + client access
   - Systems integrators: implement client infrastructure, could implement agents
   - Vertical-specific consultants: industry expertise we lack
   - Technology implementation partners: bring clients who need automation

3. Capability Partners:
   - Data engineering firms: handle complex data pipeline work
   - Security/compliance experts: help with regulated industries
   - Industry specialists: deep expertise in finance, healthcare, supply chain, etc.
   - Geographic partners: expand to new markets with local presence

4. Customer Partners:
   - Happy customers: reference customers, case studies, joint marketing
   - Industry leaders: partnerships with recognizable brands amplify credibility
   - Strategic accounts: who could we partner with at scale?

5. Influencer/Thought Leadership Partners:
   - Industry analysts (Gartner, Forrester)
   - Podcast hosts and content creators
   - Industry associations and communities
   - Competitive intelligence: potential acquirers or being acquired

Partnership evaluation criteria:

1. Market Fit:
   - Does the partner reach our ICP?
   - Do they have similar target markets? (not direct competitor)
   - Is there true complementarity or just surface-level alignment?

2. Revenue Potential:
   - Could this partner refer significant revenue?
   - What's the revenue share structure?
   - How many deals per year would justify the effort?

3. Technical Compatibility:
   - Can our solutions integrate easily?
   - Do our tech stacks align?
   - Are there data/API compatibility issues?

4. Cultural Alignment:
   - Do we share values?
   - Is their customer service quality aligned with ours?
   - Would customers respect both brands together?

5. Effort Required:
   - How much integration work is needed?
   - Sales training and enablement?
   - Marketing and go-to-market support?

6. Competitive Issues:
   - Are there conflicts with existing partnerships?
   - Could this partner compete with us eventually?
   - Are there exclusivity considerations?

Partnership lifecycle management:

Phase 1: Identification
- Which companies serve our ICP?
- Which have complementary offerings?
- Which have credibility problems we could solve (or that could solve ours)?
- What market gaps could we fill together?

Phase 2: Evaluation
- Assess fit against criteria above
- Identify mutual value proposition
- Estimate revenue opportunity
- Identify champion within partner org

Phase 3: Outreach
- Research decision-maker(s)
- Craft compelling partnership proposal
- Identify mutual pain points we solve for each other
- Propose initial small pilot or proof concept

Phase 4: Proposal Development
- Document partnership terms (revenue share, exclusivity, term length)
- Define go-to-market strategy
- Create sales enablement materials
- Plan co-marketing activities

Phase 5: Onboarding
- Training for partner sales teams
- Technical integration and testing
- Marketing/PR launch
- Early customer pilots

Phase 6: Ongoing Management
- Regular partnership reviews (monthly or quarterly)
- Joint business planning
- Performance metrics tracking
- Pipeline acceleration and deal support

Output recommendations should be:
- Specific partner names (not "find SaaS partners" — "approach Salesforce, HubSpot, and Pipedrive")
- Concrete partnership structures ("co-deliver managed services with 60/40 revenue split, annual CAP of $500K in delivery costs")
- Clear outreach strategy (who to contact, what to say, what to send)
- Measurable success criteria (X deals per year, Y% of new customers from this channel)`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      partnership_type = 'all', // 'channel', 'technology', 'capability', 'customer', 'influencer' or 'all'
      target_market = '',
      priority_level = 'medium',
      evaluate_existing = false,
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      partnership_type,
      target_market,
      priority_level,
      evaluate_existing,
    });

    // 2. Fetch existing partnership data
    const existingPartnersQuery = await db.query(
      `SELECT id, partner_name, partnership_type, status, created_at, last_activity
       FROM partnerships
       WHERE status IN ('active', 'evaluating')
       ORDER BY last_activity DESC
       LIMIT 10`
    );

    const existingPartners = existingPartnersQuery.rows || [];

    // Fetch market data
    const marketDataQuery = await db.query(
      `SELECT
        industry, company_count, avg_deal_value, market_size,
        growth_rate, key_challenges
      FROM market_analysis
      WHERE created_at > NOW() - INTERVAL '90 days'
      ORDER BY market_size DESC
      LIMIT 5`
    );

    const marketSegments = marketDataQuery.rows || [];

    // 3. Build prompt for Gemini
    const userPrompt = `Identify and evaluate strategic partnership opportunities for Drooid.

Partnership Type Focus: ${partnership_type}
Target Market: ${target_market || 'All markets'}
Priority Level: ${priority_level}

EXISTING PARTNERSHIPS (${existingPartners.length}):
${existingPartners
  .map(
    (p) =>
      `- ${p.partner_name} (${p.partnership_type}): ${p.status}, last activity ${new Date(p.last_activity).toLocaleDateString()}`
  )
  .join('\n')}

TARGET MARKETS:
${marketSegments
  .map(
    (m) =>
      `- ${m.industry}: ${m.company_count} companies, $${(m.market_size / 1000000).toFixed(0)}M market, ${m.growth_rate.toFixed(0)}% growth, challenges: ${m.key_challenges}`
  )
  .join('\n')}

Drooid Value Proposition:
- We implement AI agents for sales automation and business process improvement
- Target ICP: $1M-$50M ARR tech companies, CTOs/VPs Engineering
- Capabilities: agent design, implementation, integration, training
- Differentiation: technical depth, rapid deployment (4-8 weeks), measurable ROI

Generate comprehensive partnership recommendations including:

1. Channel Partner Opportunities
   - 5-7 specific companies to approach as channel partners
   - Why each is a fit (market reach, customer profile match, complementary services)
   - Estimated annual potential per partner (number of deals, deal value)
   - Go-to-market model (sales-driven, self-serve API, co-delivery)
   - Revenue share proposal (e.g., 30% commission, 50/50 co-delivery split)

2. Technology Integration Partners
   - 3-5 specific technology partners to integrate with
   - Why integration is valuable (customer pain point solved, revenue unlock)
   - Integration complexity and timeline
   - Mutual value (what do they get?)
   - Outreach approach and decision-maker profile

3. Capability/Expertise Partners
   - 3-5 partners who bring industry or geographic expertise
   - What capabilities they bring that we lack
   - Proposed partnership model (co-delivery, referral, joint venture)
   - Customer segments this unlocks
   - Revenue potential and timeline

4. Customer/Reference Partners
   - Top 5 customers for case studies and references
   - Which industries/use cases to emphasize
   - Co-marketing opportunities (webinars, content, speaking)
   - Success metrics to track and share

5. Strategic Partnerships for Market Expansion
   - New markets/verticals we could enter with partners
   - Which partners could help us break in
   - Competitive threats we could neutralize through partnership
   - Acquisition targets or merger candidates

6. Outreach Strategy & Sales Playbook
   For top 3 priority partners:
   - Decision-maker profile (title, company, pain points)
   - Initial outreach approach (email, LinkedIn, warm intro)
   - Partnership pitch (why is this mutually valuable?)
   - Proposed first step (meeting, pilot, term sheet discussion)
   - Timeline for first deal

7. Partnership Evaluation Framework
   For each partnership opportunity:
   - Fit score (1-10) vs. Drooid criteria
   - Revenue potential estimate
   - Implementation effort (weeks, resources)
   - Risk assessment (competitive, execution, market risk)
   - Recommendation (pursue, monitor, pass)

8. 90-Day Partnership Plan
   - Which partnerships to activate immediately (quick wins)
   - Which to explore deeper (medium-term)
   - Which to monitor (long-term)
   - Resource allocation (who owns each relationship)
   - Success metrics to track

Output as JSON:
{
  "channel_partners": [
    {
      "company_name": "...",
      "why_fit": "...",
      "target_segment": "...",
      "estimated_deals_per_year": 0,
      "estimated_deal_value": 0,
      "go_to_market_model": "...",
      "revenue_share_proposal": "...",
      "decision_maker": {
        "title": "...",
        "company_context": "..."
      },
      "outreach_approach": "...",
      "initial_pitch": "...",
      "fit_score": 0,
      "timeline_to_first_deal": "..."
    }
  ],
  "technology_partners": [
    {
      "company_name": "...",
      "technology": "...",
      "integration_value": "...",
      "complexity": "high|medium|low",
      "timeline_weeks": 0,
      "mutual_value": "...",
      "decision_maker_profile": "...",
      "fit_score": 0
    }
  ],
  "capability_partners": [
    {
      "company_name": "...",
      "expertise": "...",
      "partnership_model": "...",
      "customer_segments_unlocked": [...],
      "estimated_annual_revenue": 0,
      "fit_score": 0
    }
  ],
  "customer_partners": [
    {
      "customer_name": "...",
      "industry": "...",
      "use_case": "...",
      "reference_potential": "high|medium|low",
      "case_study_potential": true,
      "co_marketing_ideas": [...]
    }
  ],
  "strategic_expansions": [
    {
      "opportunity": "...",
      "partner_needed": "...",
      "market_size": 0,
      "timeline": "..."
    }
  ],
  "90_day_plan": {
    "immediate_activations": [...],
    "medium_term_exploration": [...],
    "long_term_monitoring": [...],
    "resource_allocation": {...},
    "success_metrics": [...]
  }
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let partnershipData;
    try {
      partnershipData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!partnershipData.channel_partners || !partnershipData['90_day_plan']) {
      throw new Error('Gemini response missing required partnership data');
    }

    // 5. Store in Supabase
    const allPartners = [
      ...partnershipData.channel_partners,
      ...partnershipData.technology_partners,
      ...partnershipData.capability_partners,
    ];

    const createdPartnerIds = [];

    for (const partner of allPartners.slice(0, 15)) {
      // Limit to first 15 to avoid excessive DB writes
      const partnerType = partner.go_to_market_model
        ? 'channel'
        : partner.integration_value
          ? 'technology'
          : 'capability';

      const fitScore = partner.fit_score || 0;

      const partnerRecord = await db.query(
        `INSERT INTO partnerships (
          partner_name, partnership_type, fit_score, status,
          partner_data, outreach_plan, estimated_revenue
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          partner.company_name,
          partnerType,
          fitScore,
          fitScore >= 8 ? 'prioritize' : fitScore >= 6 ? 'evaluating' : 'monitor',
          JSON.stringify(partner),
          JSON.stringify({
            decision_maker: partner.decision_maker || partner.decision_maker_profile,
            outreach: partner.outreach_approach || partner.initial_pitch,
            approach: partner.initial_pitch,
          }),
          partner.estimated_deals_per_year
            ? partner.estimated_deals_per_year * (partner.estimated_deal_value || 0)
            : partner.estimated_annual_revenue || 0,
        ]
      );

      if (partnerRecord.rows.length) {
        createdPartnerIds.push(partnerRecord.rows[0].id);

        // Create outreach record for high-fit partners
        if (fitScore >= 7) {
          await db.query(
            `INSERT INTO outreach (
              partner_id, outreach_type, status, template_data
            ) VALUES ($1, $2, $3, $4)`,
            [
              partnerRecord.rows[0].id,
              'partnership_outreach',
              'pending',
              JSON.stringify({
                decision_maker: partner.decision_maker,
                pitch: partner.initial_pitch,
                timeline: partner.timeline_to_first_deal,
              }),
            ]
          );

          // Create approval if high priority
          if (fitScore >= 8) {
            await db.query(
              `INSERT INTO approvals (partner_id, type, status, reviewer_role)
               VALUES ($1, $2, $3, $4)`,
              [partnerRecord.rows[0].id, 'partnership_approval', 'pending', 'ceo']
            );
          }
        }
      }
    }

    // Store customer partners
    for (const customer of partnershipData.customer_partners?.slice(0, 5) || []) {
      await db.query(
        `INSERT INTO customer_partnerships (
          customer_name, industry, use_case, reference_potential,
          case_study_eligible, comarketing_plan
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          customer.customer_name,
          customer.industry,
          customer.use_case,
          customer.reference_potential,
          customer.case_study_potential,
          JSON.stringify(customer.co_marketing_ideas),
        ]
      );
    }

    // 6. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      partners_identified: allPartners.length,
      partners_created: createdPartnerIds.length,
      high_priority_count: allPartners.filter((p) => (p.fit_score || 0) >= 8).length,
      total_opportunity_value: allPartners.reduce(
        (sum, p) => sum + ((p.estimated_deals_per_year || 0) * (p.estimated_deal_value || 0) || p.estimated_annual_revenue || 0),
        0
      ),
    });

    return {
      success: true,
      partners_identified: allPartners.length,
      created_partner_records: createdPartnerIds.length,
      summary: {
        channel_partners_count: partnershipData.channel_partners.length,
        technology_partners_count: partnershipData.technology_partners.length,
        capability_partners_count: partnershipData.capability_partners.length,
        customer_partners_count: (partnershipData.customer_partners || []).length,
        high_priority_count: allPartners.filter((p) => (p.fit_score || 0) >= 8).length,
      },
      opportunity_value: {
        total_annual_potential: allPartners.reduce(
          (sum, p) =>
            sum +
            ((p.estimated_deals_per_year || 0) * (p.estimated_deal_value || 0) ||
              p.estimated_annual_revenue ||
              0),
          0
        ),
        per_partner_avg: Math.round(
          allPartners.reduce(
            (sum, p) =>
              sum +
              ((p.estimated_deals_per_year || 0) * (p.estimated_deal_value || 0) ||
                p.estimated_annual_revenue ||
                0),
            0
          ) / allPartners.length
        ),
      },
      top_partners: partnershipData.channel_partners
        .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
        .slice(0, 5)
        .map((p) => ({
          name: p.company_name,
          type: 'channel',
          fit_score: p.fit_score,
          potential_annual: (p.estimated_deals_per_year || 0) * (p.estimated_deal_value || 0),
        })),
      plan_summary: {
        immediate_activations: (partnershipData['90_day_plan'].immediate_activations || []).length,
        medium_term: (partnershipData['90_day_plan'].medium_term_exploration || []).length,
        long_term_monitoring: (partnershipData['90_day_plan'].long_term_monitoring || []).length,
      },
      status: 'partnerships_identified_pending_approval',
      message: `Identified ${allPartners.length} partnership opportunities with ${createdPartnerIds.length} created for tracking`,
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
