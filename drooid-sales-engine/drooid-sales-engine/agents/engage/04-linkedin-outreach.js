const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-04';
const AGENT_NAME = 'LinkedIn Outreach';

const SYSTEM_PROMPT = `You are an expert LinkedIn sales outreach specialist. Your role is to craft hyper-personalized connection requests and follow-up sequences that feel authentic, never templated, and that establish genuine business relationships.

EXPERTISE:
- LinkedIn sales outreach best practices
- Personalization at scale
- Connection request psychology
- Sales sequence sequencing and timing
- Objection prevention through value-first messaging
- Following LinkedIn platform guidelines (no spam, authentic engagement)

YOUR MISSION:
Write a 4-message LinkedIn sequence that:
1. Gets accepted (high connection rate)
2. Establishes credibility and relevance immediately
3. Provides value BEFORE asking for anything
4. Moves the prospect toward a sales conversation naturally
5. Maintains authentic, peer-to-peer tone throughout

MESSAGE TYPES & RULES:

1. CONNECTION REQUEST (required - max 300 chars including personalization)
   Rules:
   - Never generic ("I'd like to connect")
   - Always reference something specific: recent article, product launch, job posting, conference, hire, funding
   - Show you understand their role and why you're reaching out
   - Make it about THEM, not about a meeting
   - Example: "Saw your team shipped ML inference improvements on X. As someone obsessed with production ML scaling, would love to connect and swap insights about your architecture."

2. VALUE MESSAGE (Day 3, if they accept - max 150 words)
   Rules:
   - Share something useful immediately (insight, case study, article, question)
   - Demonstrate genuine understanding of their challenges
   - NO PITCH - just value
   - Build relationship, not sales pressure
   - Example: "Quick thought: your recent hiring of 5 ML engineers suggests scaling inference pipelines. We've helped similar teams reduce latency 60% through [specific approach]. Curious if this is on your roadmap?"

3. SOFT CTA (Day 7 - max 150 words)
   Rules:
   - Introduce yourself and company briefly
   - Reference value provided in message 2
   - Suggest a casual, low-commitment conversation
   - Position as peer exploration, not sales call
   - Example: "Worth a quick chat? I work with teams like yours on ML infrastructure. Could share what others are doing to solve this faster. No pressure - just a thought."

4. BREAKUP (Day 14 - max 100 words)
   Rules:
   - Acknowledge they might be busy
   - Leave door open for future
   - Don't make them feel bad
   - Optional forward-looking statement
   - Example: "Totally understand if this isn't timely. If ML infrastructure becomes a priority in next quarter, happy to reconnect. Best of luck with the launch!"

PERSONALIZATION REQUIREMENTS:
- MUST include 2+ specific details about the prospect or company
- Examples: Product they launched, person they hired, article they wrote, conference they spoke at, funding announcement, job posting, growth metric
- Details should be verifiable and recent (last 6 months preferred)
- Show research without being creepy (avoid private info, family details)

OUTPUT FORMAT:
{
  "contact_id": "UUID",
  "contact_name": "Full Name",
  "contact_title": "Title",
  "company_name": "Company",
  "lead_id": "UUID",
  "sequence_name": "LinkedIn Outreach Sequence",
  "sequence_type": "linkedin",
  "total_messages": 4,
  "estimated_response_rate": 45,
  "messages": [
    {
      "sequence_number": 1,
      "message_type": "connection_request",
      "day": 0,
      "character_count": 287,
      "content": "Saw your team shipped ML inference improvements on Y. As someone obsessed with production ML scaling, would love to connect and swap insights about your architecture.",
      "personalization_details": [
        "Recent ML inference shipping (verified on LinkedIn/product blog)",
        "Architecture discussion relevance to their engineering role"
      ]
    },
    {
      "sequence_number": 2,
      "message_type": "value_message",
      "day": 3,
      "word_count": 48,
      "content": "Quick thought: your recent hiring of 5 ML engineers suggests scaling inference pipelines. We've helped similar teams reduce latency 60% through intelligent caching strategies. Curious if this is on your roadmap?",
      "value_proposition": "Inference optimization case study relevant to their hiring signals",
      "no_pitch": true
    },
    {
      "sequence_number": 3,
      "message_type": "soft_cta",
      "day": 7,
      "word_count": 67,
      "content": "Worth a quick chat? I work with teams like yours on ML infrastructure challenges. Could share what others are doing to solve inference scaling faster. No pressure - just a thought.",
      "positioning": "Peer exploration, low-commitment conversation",
      "company_intro": "Drooid - we help AI teams ship faster"
    },
    {
      "sequence_number": 4,
      "message_type": "breakup",
      "day": 14,
      "word_count": 42,
      "content": "Totally understand if this isn't timely. If ML infrastructure becomes a focus in the next quarter, happy to reconnect. Best of luck with the upcoming product launch!",
      "tone": "Understanding, door left open",
      "no_urgency": true
    }
  ],
  "sequence_metadata": {
    "total_characters_across_sequence": 456,
    "estimated_read_time_minutes": 2,
    "personalization_score": 88,
    "authenticity_score": 92,
    "expected_outcomes": {
      "connection_acceptance_rate": "45-55%",
      "message_open_rate": "60-70%",
      "soft_cta_response_rate": "15-25%",
      "meeting_request_rate": "5-10%"
    }
  },
  "notes": "Strong technical credibility with recent ML hiring. Champion-level prospect (VP Eng). Sequence emphasizes architecture and scaling challenges specific to their growth stage.",
  "created_at": "ISO timestamp"
}

CRITICAL RULES:
1. AUTHENTICITY FIRST: Every detail must be verifiable and true. No fabricated personalization.
2. VALUE-FIRST: Always lead with insight/value, never with sales pitch
3. TONE: Peer-to-peer, technical depth where appropriate, conversational
4. LENGTH: Strictly enforce word/character limits - constraint breeds clarity
5. TIMING: 3-7-14 day sequence is proven optimal for LinkedIn
6. NO SPAM: Never ask for immediate meetings, never desperate tone
7. Return valid JSON only`;

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

    // Get lead and ICP profile for context
    const lead = await db.query('SELECT * FROM leads WHERE id = ?', [leadId]);
    const leadData = lead[0];

    const icpProfile = await db.query('SELECT profile_json FROM icp_profiles WHERE lead_id = ?', [leadId]);
    const profileData = icpProfile && icpProfile[0] ? icpProfile[0].profile_json : {};

    logger.info(`${AGENT_ID}: Creating sequence for ${contactData.full_name} at ${leadData.company_name}`);

    // Build context for Gemini
    const personalizationContext = `
PROSPECT:
Name: ${contactData.full_name}
Title: ${contactData.title}
Function: ${contactData.function}
LinkedIn: ${contactData.linkedin_url || 'Unknown'}
Notes: ${contactData.notes || ''}

COMPANY:
Name: ${leadData.company_name}
Domain: ${leadData.domain}
Industry: ${leadData.industry}
Employees: ${leadData.employee_count_estimate}
Revenue: $${(leadData.revenue_estimate_usd / 1000000).toFixed(1)}M
Growth Signals: ${Array.isArray(leadData.growth_signals) ? leadData.growth_signals.join('; ') : leadData.growth_signals}
Pain Points: ${Array.isArray(leadData.pain_points) ? leadData.pain_points.join('; ') : leadData.pain_points}

ENGAGEMENT STRATEGY:
${contactData.engagement_strategy || 'Standard technical approach'}

ICP PROFILE INSIGHTS:
${profileData && profileData.personalization_hooks ? `
Key Hooks:
${profileData.personalization_hooks
  .slice(0, 3)
  .map(h => `- ${h.hook}`)
  .join('\n')}
` : ''}

DROOID CONTEXT:
We provide AI implementation services - helping teams ship AI faster through automated data pipelines, ML ops infrastructure, and intelligent workflow automation.`;

    const userPrompt = `Create a highly personalized 4-message LinkedIn outreach sequence for this prospect:

${personalizationContext}

Requirements:
1. Connection request (max 300 chars): Reference 2+ specific details from their company/role
2. Value message (Day 3): Share insight specific to their challenge
3. Soft CTA (Day 7): Invite conversation without pressure
4. Breakup (Day 14): Leave door open for future

Make it feel authentic, never like a template. This is a peer reaching out, not a sales machine.

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
        error: 'AI response missing required 4 messages',
      };
    }

    // Store sequence in database
    const outreachData = {
      contact_id: contactId,
      lead_id: leadId,
      company_name: leadData.company_name,
      contact_name: contactData.full_name,
      contact_title: contactData.title,
      channel: 'linkedin',
      sequence_type: 'linkedin_outreach',
      sequence_name: `LinkedIn Outreach - ${contactData.full_name}`,
      total_messages: 4,
      status: 'draft',
      messages_json: sequence.messages,
      sequence_metadata: {
        personalization_score: sequence.sequence_metadata?.personalization_score || 85,
        authenticity_score: sequence.sequence_metadata?.authenticity_score || 85,
        expected_response_rate: sequence.sequence_metadata?.expected_outcomes?.soft_cta_response_rate || '15-25%',
      },
      notes: sequence.notes || '',
      source_agent: AGENT_ID,
    };

    const outreachId = await db.insert('outreach', outreachData);

    // Create approval record
    await db.createApproval({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action_type: 'LINKEDIN_SEQUENCE',
      resource_id: outreachId,
      resource_type: 'outreach',
      summary: `LinkedIn sequence for ${contactData.full_name} at ${leadData.company_name}`,
      details: {
        contact_name: contactData.full_name,
        contact_title: contactData.title,
        company_name: leadData.company_name,
        messages: sequence.messages.map(m => ({
          type: m.message_type,
          day: m.day,
          preview: m.content.substring(0, 100),
        })),
        personalization_score: sequence.sequence_metadata?.personalization_score,
      },
      status: 'pending',
      created_by: AGENT_ID,
      approval_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    logger.info(`${AGENT_ID}: Sequence created and stored`, { outreachId, contact: contactData.full_name });

    return {
      success: true,
      outreach_id: outreachId,
      contact_name: contactData.full_name,
      company_name: leadData.company_name,
      channel: 'linkedin',
      messages_created: 4,
      personalization_score: sequence.sequence_metadata?.personalization_score || 85,
      approval_required: true,
      messages_preview: sequence.messages.map(m => ({
        type: m.message_type,
        day: m.day,
        preview: m.content.substring(0, 80) + '...',
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
