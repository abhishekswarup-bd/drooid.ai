const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-01';
const AGENT_NAME = 'Prospect Scout';

const SYSTEM_PROMPT = `You are an expert B2B sales researcher specializing in identifying high-potential prospects for AI implementation services. Your role is to analyze company data and determine fit against the Ideal Customer Profile (ICP).

EXPERTISE:
- B2B SaaS/enterprise software sales patterns
- AI/ML adoption signals and buying cycles
- Tech company structure and growth indicators
- Revenue estimation from public data
- Digital transformation trends

YOUR TASK:
Analyze the provided company information and determine if it matches the ICP criteria. Output a structured assessment for each company.

ICP CRITERIA:
- Industry: Technology, SaaS, Healthcare Tech, FinTech, Enterprise Software, Data/Analytics
- Revenue: $1M - $50M ARR
- Employees: 10 - 500
- Growth Signals: Recent funding, hiring spree, product launches, tech stack modernization
- Decision Making: Typically has CTO/VP Eng/Head of AI or equivalent
- Problem Fit: Using legacy tools, manual processes, scaling pains, competitive pressure

SCORING CRITERIA (0-100):
- Revenue fit (0-25): Does the company size match? Larger orgs have more budget.
- Industry fit (0-25): Is this a tech-forward industry likely to adopt AI?
- Growth signals (0-20): Recent funding, hiring, expansion, technical ambition?
- Pain point relevance (0-15): Clear signals of needing AI implementation help?
- Decision-making clarity (0-15): Can you identify likely technical decision-makers?

OUTPUT FORMAT:
Return a JSON array with exactly this structure for each company analyzed:
{
  "company_name": "Exact company name",
  "domain": "company.com",
  "industry": "Primary industry",
  "employee_count_estimate": 150,
  "revenue_estimate_usd": 5000000,
  "revenue_range": "$1M-$10M",
  "match_score": 78,
  "scoring_breakdown": {
    "revenue_fit": 20,
    "industry_fit": 24,
    "growth_signals": 18,
    "pain_point_relevance": 12,
    "decision_making_clarity": 14
  },
  "growth_signals": ["Series B funding in 2024", "Hiring AI engineers", "Product expansion"],
  "pain_points_identified": ["Manual data pipelines", "Legacy ML infrastructure", "Need for better automation"],
  "technology_stack_indicators": ["Python", "TensorFlow", "AWS", "Kubernetes"],
  "competitive_landscape": "Brief assessment of competitive position",
  "reasoning": "Detailed explanation of why this company matches or doesn't match ICP. Be specific about which signals you're using.",
  "recommended_action": "OUTREACH" | "WATCH_LIST" | "NOT_QUALIFIED",
  "next_steps": "What information would strengthen this assessment?"
}

IMPORTANT CONSTRAINTS:
1. Only return companies with match_score >= 65 as "OUTREACH"
2. Don't make up data - if you can't verify something, mark it as uncertain
3. Reference specific sources or signals for each assessment
4. For "WATCH_LIST" companies (score 50-64), note what improvements would increase the score
5. Be conservative - it's better to miss a prospect than pursue an unqualified one
6. Return valid JSON only, no additional text`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Gather existing leads to avoid duplicates
    const existingLeads = await db.query(
      `SELECT domain FROM leads WHERE status IN ('approved', 'active', 'rejected')`
    );
    const existingDomains = new Set(existingLeads.map(l => l.domain));

    // Get ICP config
    const icpConfig = context.icp_config || {
      industries: ['Technology', 'SaaS', 'Healthcare Tech', 'FinTech', 'Enterprise Software', 'Data/Analytics'],
      min_employees: 10,
      max_employees: 500,
      min_revenue_usd: 1000000,
      max_revenue_usd: 50000000,
    };

    // Get companies to analyze (passed from web scraper or external source)
    const companiesToAnalyze = context.companies || [];

    if (companiesToAnalyze.length === 0) {
      logger.warn(`${AGENT_ID}: No companies provided for analysis`);
      return {
        success: true,
        prospects_found: 0,
        message: 'No companies provided for analysis',
      };
    }

    // Filter out already-processed companies
    const newCompanies = companiesToAnalyze.filter(
      c => !existingDomains.has(c.domain)
    );

    if (newCompanies.length === 0) {
      logger.info(`${AGENT_ID}: All companies already processed`);
      return {
        success: true,
        prospects_found: 0,
        message: 'All companies already processed',
      };
    }

    // Build comprehensive prompt with company data
    const companyDataText = newCompanies
      .map(company => {
        return `
COMPANY: ${company.name}
Domain: ${company.domain}
Website Content: ${company.website_content?.substring(0, 1500) || 'N/A'}
News/Press: ${company.news?.substring(0, 1000) || 'N/A'}
Social Signals: ${company.social_indicators?.substring(0, 800) || 'N/A'}
Funding Data: ${company.funding_data?.substring(0, 800) || 'N/A'}
Job Postings: ${company.job_postings?.substring(0, 1000) || 'N/A'}
Technology Stack: ${company.tech_stack?.join(', ') || 'N/A'}`;
      })
      .join('\n---\n');

    const userPrompt = `Analyze these companies against our ICP criteria:

${companyDataText}

ICP REQUIREMENTS:
- Revenue: $${(icpConfig.min_revenue_usd / 1000000).toFixed(1)}M - $${(icpConfig.max_revenue_usd / 1000000).toFixed(0)}M
- Employees: ${icpConfig.min_employees} - ${icpConfig.max_employees}
- Industries: ${icpConfig.industries.join(', ')}

For each company, provide structured assessment. Return ONLY valid JSON array, no additional text.`;

    // Call Gemini
    const response = await callGemini({
      system_prompt: SYSTEM_PROMPT,
      user_prompt: userPrompt,
      temperature: 0.3,
      max_tokens: 4000,
    });

    // Parse response
    let prospects = [];
    try {
      prospects = JSON.parse(response.content);
      if (!Array.isArray(prospects)) {
        prospects = [prospects];
      }
    } catch (e) {
      logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message, response: response.content });
      return {
        success: false,
        error: 'Failed to parse AI response',
        details: e.message,
      };
    }

    // Validate and store qualified prospects
    const qualifiedProspects = prospects.filter(p => p.recommended_action === 'OUTREACH');
    const watchListProspects = prospects.filter(p => p.recommended_action === 'WATCH_LIST');
    const notQualified = prospects.filter(p => p.recommended_action === 'NOT_QUALIFIED');

    logger.info(`${AGENT_ID}: Analysis complete`, {
      qualified: qualifiedProspects.length,
      watch_list: watchListProspects.length,
      not_qualified: notQualified.length,
    });

    // Store qualified prospects in leads table
    const storedLeads = [];
    for (const prospect of qualifiedProspects) {
      try {
        const leadData = {
          company_name: prospect.company_name,
          domain: prospect.domain,
          industry: prospect.industry,
          employee_count_estimate: prospect.employee_count_estimate,
          revenue_estimate_usd: prospect.revenue_estimate_usd,
          match_score: prospect.match_score,
          growth_signals: prospect.growth_signals,
          pain_points: prospect.pain_points_identified,
          technology_stack: prospect.technology_stack_indicators,
          competitive_landscape: prospect.competitive_landscape,
          sourcing_reasoning: prospect.reasoning,
          status: 'pending_approval',
          source_agent: AGENT_ID,
          source_agent_name: AGENT_NAME,
        };

        const leadId = await db.insert('leads', leadData);
        storedLeads.push({ id: leadId, ...leadData });

        // Create approval record
        await db.createApproval({
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action_type: 'ADD_LEAD',
          resource_id: leadId,
          resource_type: 'lead',
          summary: `Add ${prospect.company_name} to active pipeline (Score: ${prospect.match_score})`,
          details: {
            company_name: prospect.company_name,
            domain: prospect.domain,
            match_score: prospect.match_score,
            scoring_breakdown: prospect.scoring_breakdown,
            reasoning: prospect.reasoning,
            growth_signals: prospect.growth_signals,
            pain_points: prospect.pain_points_identified,
          },
          status: 'pending',
          created_by: AGENT_ID,
          approval_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });

        logger.info(`${AGENT_ID}: Created lead and approval record`, { leadId, company: prospect.company_name });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to store lead`, { company: prospect.company_name, error: err.message });
      }
    }

    // Store watch list items
    for (const prospect of watchListProspects) {
      try {
        await db.insert('leads', {
          company_name: prospect.company_name,
          domain: prospect.domain,
          industry: prospect.industry,
          employee_count_estimate: prospect.employee_count_estimate,
          revenue_estimate_usd: prospect.revenue_estimate_usd,
          match_score: prospect.match_score,
          growth_signals: prospect.growth_signals,
          pain_points: prospect.pain_points_identified,
          technology_stack: prospect.technology_stack_indicators,
          sourcing_reasoning: prospect.reasoning,
          status: 'watch_list',
          source_agent: AGENT_ID,
        });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to store watch list item`, { error: err.message });
      }
    }

    return {
      success: true,
      prospects_analyzed: prospects.length,
      prospects_qualified: qualifiedProspects.length,
      prospects_watch_list: watchListProspects.length,
      prospects_not_qualified: notQualified.length,
      qualified_prospects: storedLeads,
      approval_records_created: storedLeads.length,
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
