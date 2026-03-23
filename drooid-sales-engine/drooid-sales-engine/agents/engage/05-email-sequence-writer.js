const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-05';
const AGENT_NAME = 'Email Sequence Writer';

const SYSTEM_PROMPT = `You are an expert B2B cold email copywriter specializing in enterprise AI/SaaS services. Your craft is writing emails that feel personal, never spammy, and that establish genuine value before asking for anything.

EXPERTISE:
- Cold email copywriting and psychology
- Subject line optimization (curiosity-driven, never clickbait)
- B2B SaaS sales email sequences
- Objection prevention through value-first positioning
- Response rate optimization (15-25% target for cold email)
- Email deliverability best practices

YOUR MISSION:
Write a 4-email cold email sequence that:
1. Gets opened (high subject line open rate)
2. Establishes credibility and relevance immediately
3. Provides genuine value/insight BEFORE any pitch
4. Overcomes objections preemptively
5. Moves prospect toward a sales conversation naturally
6. Stays under 150 words per email (concise = better response)

EMAIL SEQUENCE STRUCTURE:

1. INITIAL EMAIL (Day 0)
   Subject: Curiosity-driven, never clickbait
   - Cold open with relevance (why you're writing them specifically)
   - Share an insight or observation specific to their company
   - Ask a genuine question (shows you're listening, not selling)
   - NO CTA - just value and genuine interest
   - Word limit: 120 words
   - Example: "Hi [Name], Noticed your team shipped that inference optimization last month. Curious - how'd you approach the latency challenges at scale? We've helped similar teams cut inference time 60%, which seemed relevant to your growth."

2. FOLLOW-UP #1 (Day 2)
   Subject: Reference original email or provide additional value
   - Assume they're busy (don't be hurt)
   - Provide additional value/insight
   - Reference specific growth signal
   - Still no pitch, just utility
   - Word limit: 130 words
   - Example: "One more thought: your hiring of 5 ML engineers suggests serious scale-up. Most teams we work with have found [specific insight relevant to growth]. Worth exploring?"

3. FOLLOW-UP #2 (Day 5)
   Subject: Value-focused, maybe slight ask
   - Introduce yourself and company briefly (first mention!)
   - Share a relevant case study or metric
   - Suggest low-commitment conversation
   - Positioning: peer discussion, not sales pitch
   - Word limit: 140 words
   - Example: "Hi [Name], I work with AI-heavy teams on implementation infrastructure. A similar-stage company reduced time-to-model by 6 weeks. Could be relevant given your expansion. Happy to chat 15min if timing's right?"

4. BREAKUP EMAIL (Day 10)
   Subject: Direct, acknowledgment, door left open
   - Acknowledge they're likely busy/not interested
   - Leave door open for future timing
   - No guilt trip, genuine understanding
   - Offer forward-looking reason to reconnect
   - Word limit: 100 words
   - Example: "Totally get it - lots going on. If ML infrastructure or team scaling becomes a priority in Q2, happy to reconnect. Best of luck with the product launch!"

SUBJECT LINE RULES:
- Curiosity-driven (not clickbait)
- Specific to prospect or company
- Never all-caps
- Never multiple ??? or !!!
- Avoid: Free, Limited time, Exclusive, Act now
- Target: Question, observation, specific reference
- Examples:
  * "Your ML team scaling - few thoughts"
  * "That inference optimization you shipped"
  * "15 min on implementation velocity?"

PERSONALIZATION REQUIREMENTS:
- MUST include 2+ specific details about prospect/company
- Examples: Recent product launch, hiring announcement, funding, technical blog post, job posting, growth metric
- ALL details must be verifiable from public sources
- Show research without being creepy

OBJECTION PREVENTION:
- "We have internal team" → Augmentation angle, specialized expertise
- "Too expensive" → ROI framing (time-to-market savings)
- "We're not ready" → Acknowledge, offer to prepare for growth
- "Need to think" → Make easy next step
- "We're evaluating [competitor]" → Explain differentiation

OUTPUT FORMAT:
{
  "contact_id": "UUID",
  "contact_name": "Full Name",
  "contact_email": "email@company.com",
  "company_name": "Company",
  "lead_id": "UUID",
  "sequence_name": "Cold Email Sequence",
  "sequence_type": "email",
  "total_messages": 4,
  "estimated_response_rate": 18,
  "messages": [
    {
      "sequence_number": 1,
      "email_type": "initial",
      "day": 0,
      "subject": "Your ML team scaling - few thoughts",
      "word_count": 118,
      "body": "Hi John,\n\nNoticed your team shipped that inference optimization last month - impressive execution. Question: how'd you approach the latency challenges at scale?\n\nWe've helped similar teams cut inference time by 60%, which seemed relevant given your growth signals. Would love to hear about your approach.\n\nBest,\n[Sender]",
      "personalization_details": [
        "Recent ML inference shipping (public product announcement)",
        "Specific to their technical role and company growth"
      ],
      "value_provided": "Genuine question about their approach"
    },
    {
      "sequence_number": 2,
      "email_type": "follow_up_1",
      "day": 2,
      "subject": "Re: Your ML team scaling",
      "word_count": 125,
      "body": "One more thought: your recent hiring of 5 ML engineers suggests serious infrastructure build-out. Most teams at your stage have found that intelligent caching + feature pre-computation cuts deployment cycles by 50%+.\n\nCould be relevant to your roadmap. Let me know if worth exploring.\n\nBest,\n[Sender]",
      "value_proposition": "Specific implementation insight relevant to their hiring"
    },
    {
      "sequence_number": 3,
      "email_type": "value_add",
      "day": 5,
      "subject": "Quick resource for your team",
      "word_count": 138,
      "body": "Hi John,\n\nI work with AI-heavy teams on implementation infrastructure. A Series B company similar to yours recently reduced time-to-model by 6 weeks through better ML ops automation.\n\nWould be relevant to your expansion plans. Could grab 15 min next week if timing's right - no pressure.\n\nBest,\n[Sender]",
      "positioning": "Peer conversation, low-commitment ask",
      "company_intro": "Work with AI teams on implementation velocity"
    },
    {
      "sequence_number": 4,
      "email_type": "breakup",
      "day": 10,
      "subject": "Last thought",
      "word_count": 98,
      "body": "Hey John,\n\nTotally get it - lots going on. If ML infrastructure or team scaling becomes a priority in Q2, happy to reconnect.\n\nBest of luck with the upcoming product launch!\n\nBest,\n[Sender]",
      "tone": "Understanding, door left open",
      "no_hard_sell": true
    }
  ],
  "sequence_metadata": {
    "total_words": 479,
    "personalization_score": 88,
    "value_before_ask_score": 92,
    "objection_prevention_score": 78,
    "expected_outcomes": {
      "open_rate": "35-45%",
      "response_rate": "15-25%",
      "meeting_rate": "3-8%"
    }
  },
  "notes": "Strong technical credibility with recent hiring/shipping signals. Champion persona (VP Eng). Sequence emphasizes implementation velocity and team scaling.",
  "created_at": "ISO timestamp"
}

CRITICAL RULES:
1. AUTHENTICITY: Every detail must be verifiable. No fabricated personalization.
2. VALUE-FIRST: Every email must provide value before asking anything.
3. CONCISENESS: Strictly enforce word limits. Shorter = higher response rates.
4. TONE: Professional but conversational. Peer-to-peer. Never salesy.
5. SUBJECT LINES: Curiosity-driven, specific, never clickbait.
6. OBJECTION PREVENTION: Address likely objections preemptively.
7. Return valid JSON only, no additional text.`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get contact to create sequence for
    const contactId = context.contact_id;
    if (!contactId) {
      logger.error(`${AGENT_ID}: No contact_id provided`);
      return {
        success: false,
        error: 'contact_id is required',
      };
    }

    const contact = await db.query('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact || contact.length === 0) {
      logger.error(`${AGENT_ID}: Contact not found`, { contactId });
      return {
        success: false,
        error: `Contact ${contactId} not found`,
      };
    }

    const contactData = contact[0];
    const leadId = contactData.lead_id;

    // Get lead and ICP profile
    const lead = await db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    const leadData = lead[0];

    const icpProfile = await db.query('SELECT profile_json FROM icp_profiles WHERE lead_id = ?', [leadId]);
    const profileData = icpProfile && icpProfile[0] ? icpProfile[0].profile_json : {};

    logger.info(`${AGENT_ID}: Creating email sequence for ${contactData.full_name} at ${leadData.company_name}`);

    // Get any LinkedIn engagement data if available
    const linkedInEngagement = await db.query(
      'SELECT * FROM outreach WHERE contact_id = ? AND channel = ? ORDER BY created_at DESC LIMIT 1',
      [contactId, 'linkedin']
    );
    const linkedInData = linkedInEngagement && linkedInEngagement[0] ? linkedInEngagement[0] : null;

    // Build context for Gemini
    const personalizationContext = `
PROSPECT:
Name: ${contactData.full_name}
Email: ${contactData.email || '[TO_BE_FOUND]'}
Title: ${contactData.title}
Function: ${contactData.function}
Seniority: ${contactData.seniority_level}
Notes: ${contactData.notes || ''}

COMPANY:
Name: ${leadData.company_name}
Domain: ${leadData.domain}
Industry: ${leadData.industry}
Employees: ${leadData.employee_count_estimate}
Revenue: $${(leadData.revenue_estimate_usd / 1000000).toFixed(1)}M
Growth Signals: ${Array.isArray(leadData.growth_signals) ? leadData.growth_signals.join('; ') : leadData.growth_signals}
Pain Points: ${Array.isArray(leadData.pain_points) ? leadData.pain_points.join('; ') : leadData.pain_points}

ENGAGEMENT CONTEXT:
${contactData.engagement_strategy || 'Technical focus'}
${linkedInData ? `LinkedIn sequence started: ${linkedInData.created_at}` : 'No prior LinkedIn outreach'}

ICP PROFILE INSIGHTS:
${profileData && profileData.personalization_hooks ? `
Personalization Hooks:
${profileData.personalization_hooks
  .slice(0, 3)
  .map(h => `- ${h.hook} (usage: ${h.usage})`)
  .join('\n')}

Recommended Approach:
${profileData.recommended_approach ? `
Entry Point: ${profileData.recommended_approach.primary_entry_point}
Strategy: ${profileData.recommended_approach.entry_strategy}
Key Value Props: ${(profileData.recommended_approach.key_value_propositions || []).slice(0, 2).join('; ')}
Likely Objections: ${(profileData.recommended_approach.likely_objections || []).slice(0, 2).join('; ')}
` : ''}
` : ''}`;

    const userPrompt = `Create a 4-email cold email sequence for this prospect. This email sequence is a companion to LinkedIn outreach - assume they may have seen our LinkedIn message but prioritize email as primary channel.

${personalizationContext}

Requirements:
1. Initial email (Day 0): Cold open with specific value, no CTA
2. Follow-up #1 (Day 2): Additional insight, reference growth signals
3. Follow-up #2 (Day 5): Introduce self/company, suggest low-pressure conversation
4. Breakup (Day 10): Acknowledge they're busy, leave door open

Make each email feel personal and valuable. Use specific details they'd recognize about their company. Keep words concise (100-140 per email).

Return valid JSON following the specified format.`;

    // Call Gemini
    const response = await callGemini({
      system_prompt: SYSTEM_PROMPT,
      user_prompt: userPrompt,
      temperature: 0.6,
      max_tokens: 3500,
    });

    // Parse response
    let sequence = {};
    try {
      sequence = JSON.parse(response.content);
    } catch (e) {
      logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message });
      return {
        success: false,
        error: 'Failed to parse AI response',
      };
    }

    // Validate sequence
    if (!sequence.messages || sequence.messages.length !== 4) {
      logger.error(`${AGENT_ID}: Invalid sequence structure`, { messages: sequence.messages?.length });
      return {
        success: false,
        error: 'AI response missing required 4 emails',
      };
    }

    // Store sequence in database
    const outreachData = {
      contact_id: contactId,
      lead_id: leadId,
      company_name: leadData.company_name,
      contact_name: contactData.full_name,
      contact_email: contactData.email || null,
      contact_title: contactData.title,
      channel: 'email',
      sequence_type: 'cold_email',
      sequence_name: `Email Sequence - ${contactData.full_name}`,
      total_messages: 4,
      status: 'draft',
      messages_json: sequence.messages,
      sequence_metadata: {
        personalization_score: sequence.sequence_metadata?.personalization_score || 85,
        value_before_ask_score: sequence.sequence_metadata?.value_before_ask_score || 88,
        objection_prevention_score: sequence.sequence_metadata?.objection_prevention_score || 78,
        expected_response_rate: sequence.sequence_metadata?.expected_outcomes?.response_rate || '15-25%',
      },
      notes: sequence.notes || '',
      source_agent: AGENT_ID,
    };

    const outreachId = await db.insert('outreach', outreachData);

    // Create approval record
    await db.createApproval({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action_type: 'EMAIL_SEQUENCE',
      resource_id: outreachId,
      resource_type: 'outreach',
      summary: `Email sequence for ${contactData.full_name} at ${leadData.company_name}`,
      details: {
        contact_name: contactData.full_name,
        contact_email: contactData.email || '[TO_BE_FOUND]',
        contact_title: contactData.title,
        company_name: leadData.company_name,
        emails: sequence.messages.map(m => ({
          day: m.day,
          subject: m.subject,
          type: m.email_type,
          word_count: m.word_count,
          preview: m.body.substring(0, 80),
        })),
        personalization_score: sequence.sequence_metadata?.personalization_score,
        estimated_response_rate: sequence.sequence_metadata?.expected_outcomes?.response_rate,
      },
      status: 'pending',
      created_by: AGENT_ID,
      approval_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    logger.info(`${AGENT_ID}: Email sequence created and stored`, { outreachId, contact: contactData.full_name });

    return {
      success: true,
      outreach_id: outreachId,
      contact_name: contactData.full_name,
      contact_email: contactData.email || '[TO_BE_FOUND]',
      company_name: leadData.company_name,
      channel: 'email',
      emails_created: 4,
      personalization_score: sequence.sequence_metadata?.personalization_score || 85,
      approval_required: true,
      emails_preview: sequence.messages.map(m => ({
        day: m.day,
        type: m.email_type,
        subject: m.subject,
        word_count: m.word_count,
      })),
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
