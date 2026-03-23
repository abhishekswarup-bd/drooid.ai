const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-09';
const AGENT_NAME = 'Meeting Scheduler';

const SYSTEM_PROMPT = `You are a professional executive assistant specializing in meeting logistics and pre-meeting preparation.

EXPERTISE:
- Calendar management and timezone coordination
- Meeting logistics (platform selection, attendee coordination)
- Professional meeting confirmation
- Pre-meeting brief preparation
- Proposal/POC preparation
- Stakeholder identification and coordination

YOUR MISSION:
When a prospect agrees to meet, handle all logistics and prepare for successful meeting execution. Ensure:
1. Clear meeting confirmation with all details
2. Timezone handling is correct
3. Pre-meeting brief prepares our team
4. Meeting structure and objectives are clear
5. Follow-up logistics are in place

MEETING LOGISTICS CHECKLIST:
- Time: Confirm 3 options in prospect's timezone
- Duration: Default 30min, adjust if complex topic
- Platform: Zoom/Google Meet preference and link
- Attendees: Confirm from their side (who will attend?)
- Agenda: Share clear meeting objectives
- Pre-reads: Share relevant materials
- Recording: Ask permission if appropriate
- Followup: Set expectations for next steps

PRE-MEETING BRIEF FOR CEO/SALES TEAM:
Should include:
- Prospect background and context
- Key decision-makers attending
- Their stated objectives for the meeting
- Company's strategic focus and pain points
- Key messages to emphasize
- ROI/business case talking points
- Competitive positioning if relevant
- Potential objections to address
- Next step options (POC, follow-up meeting, proposal)

MEETING TYPES:
1. DISCOVERY CALL (30-45 min)
   - Explore their challenges and current state
   - Understand buying process and timeline
   - Identify stakeholders and decision criteria
   - Share overview of services

2. TECHNICAL DEEP DIVE (45-60 min)
   - For CTO/VP Eng stakeholder
   - Architecture discussion
   - Implementation approach
   - Integration with their stack
   - Team and timeline

3. BUSINESS CASE DISCUSSION (30 min)
   - For CFO/economic buyer
   - ROI and business impact
   - Pricing and terms
   - Implementation timeline
   - Reference checks

4. EXECUTIVE BRIEFING (30 min)
   - CEO/C-level prospect
   - Strategic fit and partnership
   - Case studies and results
   - Next steps and process

TIMEZONE HANDLING:
- Detect prospect timezone from email domain, LinkedIn, or ask
- Offer 3 time slots in THEIR timezone
- Convert to our CEO's timezone in confirmation
- Format: "Thursday 2-3pm PT (5-6pm ET)"

CALENDAR INVITE DETAILS:
- Include meeting link (Zoom with waiting room)
- Agenda in description
- Pre-read materials attached or linked
- Optional: Video conferencing best practices note

OUTPUT FORMAT:
{
  "response_id": "UUID",
  "contact_name": "Name",
  "contact_email": "email@company.com",
  "company_name": "Company",
  "meeting_type": "discovery_call" | "technical_deep_dive" | "business_case" | "executive_briefing",
  "prospect_timezone": "PT" | "ET" | "CT" | "MT",
  "prospect_timezone_confidence": 85,
  "proposed_times": [
    {
      "option": 1,
      "day": "Thursday",
      "date": "2025-01-15",
      "time_prospect_tz": "2:00 PM PT",
      "time_our_tz": "5:00 PM ET",
      "duration_minutes": 30,
      "calendar_link": "https://calendly.com/drooid/discovery"
    }
  ],
  "meeting_details": {
    "platform": "Zoom",
    "duration_minutes": 30,
    "zoom_link": "https://zoom.us/j/...",
    "meeting_id": "123 456 789"
  },
  "confirmation_message": "Message to send to prospect confirming meeting details",
  "confirmation_calendar_invite": {
    "subject": "Meeting: [Topic] with Drooid",
    "description": "Meeting agenda and link",
    "duration": "30 minutes",
    "meeting_notes": "What to discuss"
  },
  "pre_meeting_brief_for_sales": {
    "prospect_summary": "Who they are, what they do, why they're talking to us",
    "key_stakeholders": ["John (CTO - technical evaluator)", "Sarah (CFO - economic buyer)"],
    "their_objectives": "What they want to accomplish in this meeting",
    "their_context": "Pain points, growth signals, current situation",
    "strategic_opportunity": "Why this is valuable for us",
    "key_messages": [
      "Message 1: addressing their primary pain point",
      "Message 2: our unique capability",
      "Message 3: relevant success story"
    ],
    "roi_talking_points": [
      "Their situation: [specific pain]",
      "Typical outcome: [metric] improvement",
      "Business impact: [revenue/cost benefit]"
    ],
    "competitive_landscape": "Are they evaluating anyone else? How do we differentiate?",
    "potential_objections": [
      "Objection 1 + response",
      "Objection 2 + response"
    ],
    "next_step_options": [
      "Option A: Technical POC with their team (2-week timeline)",
      "Option B: Proposal + reference call",
      "Option C: Follow-up meeting with [stakeholder]"
    ],
    "success_criteria": "What would success look like for this meeting? What decision would move us forward?"
  },
  "follow_up_sequence": {
    "immediately_after_meeting": "Send thank you + meeting notes within 2 hours",
    "day_3": "Send proposal or POC plan if discussed",
    "day_7": "Check in if no response - 'Any questions about our approach?'"
  },
  "notes": "Any special context or considerations",
  "calendar_invite_sent": false,
  "confirmation_pending_approval": true
}

CRITICAL RULES:
1. TIMEZONE ACCURACY: Always handle timezones correctly
2. TRIPLE-CHECK ATTENDEES: Make sure we know who's attending from their side
3. CLEAR AGENDA: Every meeting must have clear objectives
4. PREPARATION: Brief must enable our team to be maximally prepared
5. FOLLOW-UP: Set clear expectations for post-meeting communication
6. CALENDAR BLOCKING: Confirm on CEO's calendar immediately
7. Return valid JSON only`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get meeting requests to schedule
    const meetingRequests = await db.query(`
      SELECT r.*, c.full_name, c.email, c.title, l.company_name, l.domain, l.id as lead_id, o.sequence_type
      FROM responses r
      JOIN contacts c ON r.contact_id = c.id
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN outreach o ON r.outreach_id = o.id
      WHERE r.routed_to_agent = ?
      AND r.classification = 'meeting_request'
      AND r.status = 'processed'
      LIMIT ${context.batch_size || 5}
    `, [AGENT_ID]);

    if (meetingRequests.length === 0) {
      logger.info(`${AGENT_ID}: No meeting requests to schedule`);
      return {
        success: true,
        meetings_scheduled: 0,
        message: 'No meeting requests in queue',
      };
    }

    logger.info(`${AGENT_ID}: Scheduling ${meetingRequests.length} meetings`);

    const scheduled = [];

    for (const request of meetingRequests) {
      try {
        // Get ICP profile for context
        const icpProfile = await db.query('SELECT profile_json FROM icp_profiles WHERE lead_id = ?', [request.lead_id]);
        const profileData = icpProfile && icpProfile[0] ? icpProfile[0].profile_json : {};

        // Get all contacts at the company to determine attendees
        const allContacts = await db.query('SELECT * FROM contacts WHERE lead_id = ? LIMIT 10', [request.lead_id]);

        // Get lead details
        const lead = await db.query('SELECT * FROM leads WHERE id = ?', [request.lead_id]);
        const leadData = lead[0];

        // Build context for Gemini
        const schedulingContext = `
MEETING REQUEST FROM:
Name: ${request.full_name}
Title: ${request.title}
Email: ${request.email}
Company: ${request.company_name}
Domain: ${request.domain}

PROSPECT'S MESSAGE:
"${request.response_text}"

OTHER CONTACTS AT COMPANY:
${allContacts
  .map(c => `- ${c.full_name} (${c.title}) - Persona: ${c.persona_type}`)
  .join('\n')}

COMPANY CONTEXT:
Revenue: $${(leadData.revenue_estimate_usd / 1000000).toFixed(1)}M
Employees: ${leadData.employee_count_estimate}
Industry: ${leadData.industry}
Pain Points: ${Array.isArray(leadData.pain_points) ? leadData.pain_points.join('; ') : leadData.pain_points}

SALES STRATEGY:
${profileData && profileData.recommended_approach ? `
Entry Point: ${profileData.recommended_approach.primary_entry_point}
Key Value Props: ${(profileData.recommended_approach.key_value_propositions || []).slice(0, 2).join('; ')}
Buying Committee: ${profileData.recommended_approach.buying_committee_prediction || 'Unknown'}
` : ''}`;

        const userPrompt = `Schedule this meeting and prepare comprehensive pre-meeting brief for our team.

${schedulingContext}

Tasks:
1. Determine meeting type (discovery, technical, business case, executive)
2. Propose 3 meeting times (detect timezone from email/context)
3. Prepare confirmation message for prospect
4. Create comprehensive pre-meeting brief for CEO/sales team
5. Outline follow-up sequence

Meeting should be:
- Discovery call: 30 min
- Technical deep-dive: 45 min
- Business case: 30 min
- Executive: 30 min

Pre-meeting brief must include their objectives, our key messages, ROI talking points, potential objections, and next-step options.

Return valid JSON with all scheduling details and preparation brief.`;

        // Call Gemini
        const response = await callGemini({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          temperature: 0.5,
          max_tokens: 3500,
        });

        // Parse response
        let scheduling = {};
        try {
          scheduling = JSON.parse(response.content);
        } catch (e) {
          logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message });
          continue;
        }

        // Validate scheduling data
        if (!scheduling.meeting_type || !scheduling.proposed_times) {
          logger.error(`${AGENT_ID}: Invalid scheduling structure`, { scheduling: JSON.stringify(scheduling).substring(0, 200) });
          continue;
        }

        // Store meeting record
        const meetingData = {
          response_id: request.id,
          contact_id: request.contact_id,
          lead_id: request.lead_id,
          company_name: request.company_name,
          contact_name: request.full_name,
          contact_email: request.email,
          contact_title: request.title,
          meeting_type: scheduling.meeting_type,
          prospect_timezone: scheduling.prospect_timezone,
          proposed_times: JSON.stringify(scheduling.proposed_times),
          meeting_details: JSON.stringify(scheduling.meeting_details),
          confirmation_message: scheduling.confirmation_message,
          pre_meeting_brief: JSON.stringify(scheduling.pre_meeting_brief_for_sales),
          follow_up_sequence: JSON.stringify(scheduling.follow_up_sequence),
          status: 'scheduled_pending_approval',
          created_by_agent: AGENT_ID,
        };

        const meetingId = await db.insert('meetings', meetingData);

        // Update response record
        await db.update('responses', request.id, {
          status: 'meeting_scheduled',
          meeting_id: meetingId,
          handled_by_agent: AGENT_ID,
          handled_at: new Date().toISOString(),
        });

        // Create approval for sending confirmation
        await db.createApproval({
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action_type: 'SEND_MEETING_CONFIRMATION',
          resource_id: meetingId,
          resource_type: 'meeting',
          summary: `Meeting confirmation for ${request.full_name} at ${request.company_name}`,
          details: {
            contact_name: request.full_name,
            contact_email: request.email,
            company_name: request.company_name,
            meeting_type: scheduling.meeting_type,
            proposed_times: scheduling.proposed_times.map(t => `${t.day} ${t.time_prospect_tz} (${t.time_our_tz})`),
            confirmation_message: scheduling.confirmation_message.substring(0, 300),
            pre_meeting_brief_key_points: {
              their_objectives: scheduling.pre_meeting_brief_for_sales.their_objectives,
              key_messages: scheduling.pre_meeting_brief_for_sales.key_messages,
              next_step_options: scheduling.pre_meeting_brief_for_sales.next_step_options,
            },
          },
          status: 'pending',
          created_by: AGENT_ID,
          approval_deadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours urgent
        });

        scheduled.push({
          meeting_id: meetingId,
          contact_name: request.full_name,
          company_name: request.company_name,
          meeting_type: scheduling.meeting_type,
          proposed_times: scheduling.proposed_times.length,
          prospect_timezone: scheduling.prospect_timezone,
        });

        logger.info(`${AGENT_ID}: Meeting scheduled`, {
          contact: request.full_name,
          type: scheduling.meeting_type,
          meetingId,
        });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to schedule meeting`, { response_id: request.id, error: err.message });
      }
    }

    logger.info(`${AGENT_ID}: Scheduling complete`, { count: scheduled.length });

    return {
      success: true,
      meetings_scheduled: scheduled.length,
      scheduled_meetings: scheduled,
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
