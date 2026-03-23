const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-03';
const AGENT_NAME = 'ICP Profiler';

const SYSTEM_PROMPT = `You are a senior sales intelligence analyst specializing in deep company profiling for enterprise AI implementation services. Your mission is to create detailed, actionable profiles that enable hyper-personalized outreach.

EXPERTISE:
- Technology stack analysis and roadmap inference
- Competitive positioning and market dynamics
- Organizational pain point identification
- Growth trajectory and timing assessment
- Sales cycle and decision process prediction
- Case study/reference relevance

YOUR TASK:
Create a comprehensive ICP profile that answers: "What does this company need, why do they need it now, and how is our AI implementation service the perfect fit?"

PROFILING DIMENSIONS:

1. COMPANY SUMMARY
   - Business model, market position, growth stage
   - Recent milestones and strategic direction
   - Size, structure, and culture indicators

2. PAIN POINTS (List 5-7 specific, documented pain points)
   - Current infrastructure limitations
   - Specific bottlenecks or inefficiencies
   - Competitive pressures
   - Growth constraints
   - Example: "Manual feature engineering consuming 40% of DS team time"

3. GROWTH SIGNALS (Indicators of upcoming purchase readiness)
   - Recent funding (typically 6-12 months before hiring/purchasing)
   - New product launches or market expansion
   - Executive changes (new CTO/VP Eng often drives modernization)
   - Hiring in AI/ML/data/engineering
   - Strategic partnerships suggesting new technology direction
   - Conference speaking/thought leadership (signals strategic focus)

4. TECHNOLOGY STACK ANALYSIS
   - Current tools and platforms
   - Missing pieces or technical debt indicators
   - Gaps in ML/AI infrastructure
   - Scalability limitations
   - Integration challenges

5. COMPETITIVE LANDSCAPE
   - Key competitors and competitive threats
   - Feature gaps vs competitors
   - Market share pressure indicators
   - Differentiation requirements

6. PERSONALIZATION HOOKS (Specific details for outreach)
   - Specific products or features they've launched
   - Named executives/founders and their backgrounds
   - Public statements about AI/transformation
   - Technical blog posts or open source projects
   - Customer wins or case studies they've mentioned
   - Industry speaking engagements
   - Press mentions

7. RECOMMENDED APPROACH
   - Optimal entry point and persona
   - Key value propositions for this company
   - Potential objections to prepare for
   - Timeline/decision velocity assessment
   - Suggested case studies or references

8. URGENCY SCORE (1-10)
   - How soon is this company likely to buy?
   - Based on growth signals, pain point intensity, competitive pressure
   - Time-sensitive factors

OUTPUT FORMAT:
{
  "lead_id": "UUID",
  "company_name": "Company Name",
  "domain": "company.com",
  "profile_created_at": "ISO timestamp",

  "company_summary": {
    "business_model": "SaaS platform for X",
    "market_position": "Leader in Y segment, growing 150% YoY",
    "growth_stage": "Series B / Growth / Public",
    "recent_milestones": ["Series B $50M funding Jan 2024", "Entered EU market Q3 2024", "Acquired X company"],
    "strategic_direction": "Expanding enterprise features, heavy AI/ML investment"
  },

  "pain_points": [
    {
      "pain_point": "Manual model training and deployment cycles",
      "severity": "high",
      "impact": "Extends time-to-market, limits experimentation velocity",
      "frequency": "Daily friction for 15+ person ML team",
      "evidence": "Job posting mentions 'ML ops automation', tech blog discusses deployment pain"
    }
  ],

  "growth_signals": [
    {
      "signal": "Series B funding $50M (Jan 2024)",
      "timing": "6 months ago",
      "implication": "Likely 12-month hiring spree incoming, budget for tools/services available",
      "relevance": "high",
      "evidence": "Announced on their blog and TechCrunch"
    }
  ],

  "technology_stack": {
    "current_stack": ["Python", "TensorFlow", "Kubernetes", "AWS", "PostgreSQL"],
    "infrastructure_gaps": ["ML workflow orchestration", "Feature store", "Model monitoring"],
    "scalability_issues": "Manual processes not scaling with 50+ data scientists",
    "technical_debt": "Legacy Airflow deployment, monolithic ML pipelines",
    "migration_readiness": "High - team is Python-native, already using modern cloud"
  },

  "competitive_landscape": {
    "direct_competitors": ["Competitor A", "Competitor B"],
    "competitive_threats": "Competitor B just launched AI implementation services",
    "feature_gaps": "Missing enterprise security/compliance features vs Competitor A",
    "market_pressure": "Industry moving toward AI-native products",
    "differentiation_needs": "Need better ML velocity to maintain technical edge"
  },

  "personalization_hooks": [
    {
      "hook": "CTO Sarah Chen founded ML team at Google Brain",
      "relevance": "high",
      "usage": "Establishes credibility on ML infrastructure knowledge"
    },
    {
      "hook": "Announced partnership with Databricks (Sept 2024)",
      "relevance": "high",
      "usage": "Shows strategic focus on data/ML infrastructure investments"
    },
    {
      "hook": "Engineering blog post: 'Scaling ML at 10,000 requests/sec'",
      "relevance": "medium",
      "usage": "References their specific scale and performance challenges"
    }
  ],

  "recommended_approach": {
    "primary_entry_point": "Sarah Chen (CTO)",
    "entry_strategy": "Technical credibility approach - reference their blog post, discuss ML infrastructure challenges specific to their scale",
    "key_value_propositions": [
      "Reduce model-to-production time from 6 weeks to 2 weeks",
      "Scale ML team output 3x without proportional headcount growth",
      "Enterprise-grade ML operations for compliance/security"
    ],
    "likely_objections": [
      "We have internal ML ops team - overcome with augmentation angle, specialized expertise",
      "Too expensive - ROI framing: 6-week faster time-to-market enables X revenue",
      "Not now, internal focus - acknowledge, offer advisory conversation to prepare for growth"
    ],
    "buying_committee_prediction": "CTO + VP Eng + CFO, fast decision cycle (4-8 weeks), budget already allocated for ML infrastructure",
    "reference_strength": "High - if you have reference from similar Series B data-heavy SaaS"
  },

  "urgency_score": 8,
  "urgency_reasoning": "Series B funding 6mo ago + aggressive hiring + Databricks partnership + evident pain points = likely in active evaluation phase. Window is 2-3 months before funding burn requires ROI focus.",

  "sales_cycle_prediction": "4-8 weeks to close, 2-3 week evaluation, proof of value critical",
  "next_actions": [
    "Secure exec briefing with CTO via champion introduction",
    "Prepare 1-page technical brief on their specific architecture",
    "Have relevant case study (Series B SaaS company) ready",
    "Plan technical proof-of-concept with their ML ops team"
  ]
}

CRITICAL RULES:
1. ACCURACY FIRST: Only cite signals you can verify from provided data. Mark uncertainty.
2. SPECIFICITY: Generic observations are worthless. "They use AI" is bad. "They published 4 ML blog posts in Q4 suggesting infrastructure build-out" is good.
3. BUSINESS RELEVANCE: Always connect technical findings to business impact.
4. DECISION READINESS: Assess whether they're ready to buy NOW vs in 6 months.
5. REFERENCE MATCHING: Consider if we have case studies that match their exact situation.
6. Return valid JSON only, no additional text.`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get lead to profile
    const leadId = context.lead_id;
    if (!leadId) {
      logger.error(`${AGENT_ID}: No lead_id provided`);
      return {
        success: false,
        error: 'lead_id is required',
      };
    }

    const lead = await db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead || lead.length === 0) {
      logger.error(`${AGENT_ID}: Lead not found`, { leadId });
      return {
        success: false,
        error: `Lead ${leadId} not found`,
      };
    }

    const leadData = lead[0];
    logger.info(`${AGENT_ID}: Profiling ${leadData.company_name}`);

    // Gather comprehensive company context
    const companyContext = `
COMPANY: ${leadData.company_name}
Domain: ${leadData.domain}
Industry: ${leadData.industry}
Estimated Employees: ${leadData.employee_count_estimate}
Revenue Estimate: $${(leadData.revenue_estimate_usd / 1000000).toFixed(1)}M
Match Score: ${leadData.match_score}/100

SIGNALS CAPTURED:
Growth Signals: ${Array.isArray(leadData.growth_signals) ? leadData.growth_signals.join(', ') : leadData.growth_signals || 'N/A'}
Pain Points: ${Array.isArray(leadData.pain_points) ? leadData.pain_points.join(', ') : leadData.pain_points || 'N/A'}
Technology Stack: ${Array.isArray(leadData.technology_stack) ? leadData.technology_stack.join(', ') : leadData.technology_stack || 'N/A'}
Competitive Context: ${leadData.competitive_landscape || 'N/A'}

ADDITIONAL CONTEXT:
${context.website_content ? `Website Analysis:\n${context.website_content.substring(0, 2000)}\n` : ''}
${context.recent_news ? `Recent News:\n${context.recent_news.substring(0, 1500)}\n` : ''}
${context.technical_blog ? `Technical Blog:\n${context.technical_blog.substring(0, 1500)}\n` : ''}
${context.fundraising_info ? `Fundraising Info:\n${context.fundraising_info}\n` : ''}
${context.team_info ? `Key Team:\n${context.team_info}\n` : ''}`;

    const userPrompt = `Create a deep, actionable ICP profile for this company that will guide our sales approach:

${companyContext}

Focus on:
1. What specific pain points does this company face RIGHT NOW based on signals?
2. What are they trying to accomplish in next 12 months?
3. Why would they need AI implementation services specifically?
4. What's their decision timeline and buying committee structure?
5. How do we get to a champion and close this deal?

Return comprehensive JSON profile that a sales person can use immediately.`;

    // Call Gemini
    const response = await callGemini({
      system_prompt: SYSTEM_PROMPT,
      user_prompt: userPrompt,
      temperature: 0.4,
      max_tokens: 4000,
    });

    // Parse response
    let profile = {};
    try {
      profile = JSON.parse(response.content);
    } catch (e) {
      logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message, response: response.content.substring(0, 500) });
      return {
        success: false,
        error: 'Failed to parse AI response',
      };
    }

    // Validate profile structure
    if (!profile.company_name || !profile.pain_points) {
      logger.error(`${AGENT_ID}: Invalid profile structure`, { profile: JSON.stringify(profile).substring(0, 500) });
      return {
        success: false,
        error: 'AI response missing required fields',
      };
    }

    // Store profile in database
    const profileData = {
      lead_id: leadId,
      company_name: leadData.company_name,
      domain: leadData.domain,
      profile_json: profile,
      company_summary: profile.company_summary ? JSON.stringify(profile.company_summary) : null,
      pain_points_detailed: profile.pain_points ? JSON.stringify(profile.pain_points) : null,
      growth_signals_detailed: profile.growth_signals ? JSON.stringify(profile.growth_signals) : null,
      technology_stack_detailed: profile.technology_stack ? JSON.stringify(profile.technology_stack) : null,
      competitive_analysis: profile.competitive_landscape ? JSON.stringify(profile.competitive_landscape) : null,
      personalization_hooks: profile.personalization_hooks ? JSON.stringify(profile.personalization_hooks) : null,
      recommended_approach: profile.recommended_approach ? JSON.stringify(profile.recommended_approach) : null,
      urgency_score: profile.urgency_score || null,
      urgency_reasoning: profile.urgency_reasoning || null,
      sales_cycle_prediction: profile.sales_cycle_prediction || null,
      profiled_at: new Date().toISOString(),
    };

    const profileId = await db.insert('icp_profiles', profileData);

    // Update lead with profile reference
    await db.update('leads', leadId, {
      icp_profile_id: profileId,
      profiled_at: new Date().toISOString(),
    });

    logger.info(`${AGENT_ID}: Profile created and stored`, { profileId, company: leadData.company_name });

    return {
      success: true,
      profile_id: profileId,
      company_name: leadData.company_name,
      urgency_score: profile.urgency_score,
      pain_points_count: (profile.pain_points || []).length,
      growth_signals_count: (profile.growth_signals || []).length,
      personalization_hooks_count: (profile.personalization_hooks || []).length,
      recommended_entry_point: profile.recommended_approach?.primary_entry_point || 'Unknown',
      sales_cycle_prediction: profile.sales_cycle_prediction,
    };
  } catch (err) {
    logger.error(`${AGENT_ID}: Execution failed`, { error: err.message, stack: err.stack });
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
