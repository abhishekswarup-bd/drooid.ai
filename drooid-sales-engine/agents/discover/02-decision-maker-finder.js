const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-02';
const AGENT_NAME = 'Decision Maker Finder';

const SYSTEM_PROMPT = `You are an expert B2B sales intelligence analyst specializing in identifying decision-makers and buying committees for enterprise AI implementation services.

EXPERTISE:
- Organizational structures in tech and SaaS companies
- Buying committee composition and roles
- Technical vs economic decision-making authority
- Champion identification and nurturing
- Competitive analysis of similar buying groups

YOUR TASK:
Analyze company data to identify key decision-makers who would be involved in evaluating and approving AI implementation services. Map the likely buying committee structure.

BUYING COMMITTEE ROLES:
1. ECONOMIC BUYER (Budget authority, CFO/COO level) - Ultimate approval authority, ROI focus
2. TECHNICAL EVALUATOR (CTO/VP Eng/Head of ML) - Assesses feasibility, architecture, team fit
3. CHAMPION (Usually mid-level technologist) - Internal advocate, understands pain, drives evaluation
4. BLOCKER (Potential objector) - Legal, security, compliance leader - manage objections early
5. USER (Operations/data team lead) - Day-to-day stakeholder, usability concerns

IDENTIFICATION SIGNALS:
- Job title patterns: CTO, VP Engineering, VP Product, Head of AI/ML, Chief Data Officer, VP Infrastructure
- Company size determines buying committee:
  * <50 employees: CEO often involved, direct to CTO/VP Eng
  * 50-200: CTO + VP Eng + CEO input on larger spends
  * 200+: Full committee with procurement, legal
- LinkedIn signals: Recent AI hiring, engineering blog posts, conference speaking, open source contributions
- Decision velocity: Founder-led = faster, mature companies = longer cycles

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "lead_id": "UUID from leads table",
  "company_name": "Company Name",
  "domain": "company.com",
  "estimated_employees": 150,
  "committee_size_estimate": 4,
  "decision_velocity": "fast" | "medium" | "slow",
  "decision_velocity_reasoning": "Why this company is fast/medium/slow to decide",
  "contacts": [
    {
      "full_name": "John Smith",
      "title": "VP of Engineering",
      "persona_type": "technical_evaluator",
      "seniority_level": "director_level" | "vp_level" | "c_level",
      "function": "Engineering",
      "linkedin_url": "https://linkedin.com/in/john-smith",
      "email": "john.smith@company.com",
      "confidence_score": 85,
      "hiring_authority": true,
      "budget_authority": false,
      "rationale": "VP Eng typically evaluates technical fit and leads implementation. Recently posted about ML infrastructure on LinkedIn.",
      "engagement_strategy": "Technical deep-dive approach, focus on architecture and team integration"
    }
  ],
  "buying_committee_summary": "Committee likely has 4 members: CTO (champion), VP Eng (technical evaluator), CFO (economic buyer), Legal (blocker/compliance). Fast-moving company, decision window 4-8 weeks.",
  "champion_recommendation": "John Smith (VP Eng) is likely champion - active in AI community, hiring AI engineers",
  "economic_buyer_title": "CFO / VP Finance",
  "key_objection_sources": ["Legal/Compliance", "Internal AI team (turf protection)"],
  "next_steps_for_outreach": [
    "Start with champion (VP Eng) to establish technical credibility",
    "Secure champion introduction to economic buyer (CFO)",
    "Prepare legal/compliance brief for security review"
  ]
}

IMPORTANT CONSTRAINTS:
1. Only return contacts you have high confidence about (>70 confidence score)
2. Email addresses should come from Hunter.io lookups or public professional profiles
3. If you can't find specific contact info, leave email as null and note confidence level
4. Always include LinkedIn URLs if available
5. Base persona assignments on signals: not just title, but recent activity and responsibilities
6. For each contact, explain WHY you believe they're part of the buying committee
7. Never fabricate contact details - mark uncertain fields with confidence scores below 60
8. Return valid JSON only`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get approved leads without contacts yet
    const leadsWithoutContacts = await db.query(`
      SELECT l.* FROM leads l
      WHERE l.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.lead_id = l.id)
      LIMIT ${context.batch_size || 5}
    `);

    if (leadsWithoutContacts.length === 0) {
      logger.info(`${AGENT_ID}: No approved leads awaiting contact discovery`);
      return {
        success: true,
        contacts_found: 0,
        message: 'No leads requiring contact discovery',
      };
    }

    logger.info(`${AGENT_ID}: Processing ${leadsWithoutContacts.length} leads`);

    let totalContactsFound = 0;
    const processedLeads = [];

    for (const lead of leadsWithoutContacts) {
      try {
        // Build company context for Gemini
        const companyContext = `
COMPANY: ${lead.company_name}
Domain: ${lead.domain}
Industry: ${lead.industry}
Estimated Employees: ${lead.employee_count_estimate}
Revenue: $${(lead.revenue_estimate_usd / 1000000).toFixed(1)}M
Growth Signals: ${Array.isArray(lead.growth_signals) ? lead.growth_signals.join(', ') : lead.growth_signals}
Tech Stack: ${Array.isArray(lead.technology_stack) ? lead.technology_stack.join(', ') : lead.technology_stack}
Pain Points: ${Array.isArray(lead.pain_points) ? lead.pain_points.join(', ') : lead.pain_points}
Context: ${lead.sourcing_reasoning || 'No additional context'}`;

        const userPrompt = `Identify the likely decision-making committee and key contacts for AI implementation services at this company:

${companyContext}

Map out:
1. Who would evaluate technical fit? (CTO, VP Eng, Head of AI/ML)
2. Who controls the budget? (CFO, VP Product, CEO)
3. Who would champion this internally? (Mid-level engineer or PM with pain)
4. Who might block it? (Legal, Security, internal AI team)
5. Overall buying committee structure and decision velocity

Based on company size and industry, provide a realistic committee composition. For each identified role, suggest likely title and provide JSON output.`;

        // Call Gemini
        const response = await callGemini({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          temperature: 0.4,
          max_tokens: 3000,
        });

        // Parse response
        let commiteeData = {};
        try {
          commiteeData = JSON.parse(response.content);
        } catch (e) {
          logger.error(`${AGENT_ID}: Failed to parse Gemini response for ${lead.company_name}`, { error: e.message });
          continue;
        }

        // Validate and store contacts
        const validContacts = (commiteeData.contacts || []).filter(c => {
          // Only store if we have high confidence (>70) or if we have verified email
          return (c.confidence_score >= 70) || (c.email && c.confidence_score >= 60);
        });

        logger.info(`${AGENT_ID}: Found ${validContacts.length} high-confidence contacts for ${lead.company_name}`);

        // Store contacts in database
        for (const contact of validContacts) {
          try {
            const contactData = {
              lead_id: lead.id,
              company_name: lead.company_name,
              domain: lead.domain,
              full_name: contact.full_name,
              title: contact.title,
              function: contact.function || 'Engineering',
              seniority_level: contact.seniority_level || 'director_level',
              persona_type: contact.persona_type,
              email: contact.email || null,
              linkedin_url: contact.linkedin_url || null,
              confidence_score: contact.confidence_score,
              hiring_authority: contact.hiring_authority || false,
              budget_authority: contact.budget_authority || false,
              notes: contact.rationale,
              engagement_strategy: contact.engagement_strategy,
              status: 'discovered',
              source_agent: AGENT_ID,
            };

            const contactId = await db.insert('contacts', contactData);
            totalContactsFound++;

            logger.info(`${AGENT_ID}: Stored contact`, { contactId, name: contact.full_name, company: lead.company_name });
          } catch (err) {
            logger.error(`${AGENT_ID}: Failed to store contact`, { error: err.message, contact: contact.full_name });
          }
        }

        // Store committee summary on the lead
        await db.update('leads', lead.id, {
          buying_committee_summary: commiteeData.buying_committee_summary,
          champion_name: commiteeData.champion_recommendation,
          economic_buyer_title: commiteeData.economic_buyer_title,
          decision_velocity: commiteeData.decision_velocity,
          key_objections: commiteeData.key_objection_sources,
        });

        processedLeads.push({
          lead_id: lead.id,
          company_name: lead.company_name,
          contacts_found: validContacts.length,
          buying_committee: commiteeData.buying_committee_summary,
        });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to process lead`, { lead_id: lead.id, error: err.message });
      }
    }

    return {
      success: true,
      leads_processed: processedLeads.length,
      contacts_found: totalContactsFound,
      processed_leads: processedLeads,
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
