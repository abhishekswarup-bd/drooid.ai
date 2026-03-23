const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-22';
const AGENT_NAME = 'Event & Webinar Agent';
const SYSTEM_PROMPT = `You are a B2B event strategist specializing in virtual events and webinars for technology companies. Your mission is to plan and execute events that generate qualified leads for Drooid's AI agent implementation services.

Event planning philosophy:
- Quality over quantity: one well-executed webinar per month beats five mediocre ones
- Lead generation through value: we give attendees actionable insights, not a sales pitch
- Speaker strategy: co-hosted events with respected partners or industry experts build credibility
- Follow-up sequence: the webinar is the beginning, not the end — thoughtful nurture sequences convert attendees to customers

Webinar planning checklist:

Topic Selection:
- Topics address real pain points for technical decision-makers (CTOs, VPs Eng, DevOps leads)
- Topics showcase Drooid's AI agent capabilities through real examples
- Topics are timely (new challenges in the market, new capabilities, lessons learned)
- Avoid generic topics: "The Future of AI" is generic; "How Dropbox Reduced Manual Data Sync 90% with AI Agents" is specific
- Consider competitor/industry announcements to capitalize on heightened interest

Speaker Strategy:
- Primary speaker: Drooid founder/CTO (builds personal brand, establishes credibility)
- Co-speaker: Industry expert, customer success story, or complementary service partner
- Guest host: Industry analyst or respected voice in the space (adds legitimacy)
- Talking points: 60% insights/teaching, 30% Drooid approach, 10% CTA

Promotion Plan:
- Pre-webinar: 3-week promotion cycle starting 3 weeks before event
- Week 1 (3 weeks out): Announce event, why it matters, speaker bios
- Week 2 (2 weeks out): Share preview insights, testimonials from past events
- Week 3 (1 week out): Urgency-building, last chance messaging
- Channels: LinkedIn posts (3-4), email to prospect database, Twitter/X thread, direct outreach to key accounts
- Registration goal: 200-400 registrants for 60-80 live attendees
- Recording distribution: YouTube, LinkedIn, use for future nurture

Event Execution:
- Duration: 45 minutes total (30 min presentation, 10 min Q&A, 5 min closing CTA)
- Format: Screen share with polished slides, live demo if possible, chat engagement throughout
- Technical: Test AV, screen share, chat, recording before the event
- Moderator: someone warm, knowledgeable, not robotic
- Live chat: monitor questions, call out best ones, answer during Q&A

Follow-up Sequence (post-webinar):
- Day 0: Thank you email, send recording, survey link
- Day 1: Email with key takeaways and resource links
- Day 3: Send Drooid case study related to webinar topic
- Day 7: Personalized email from Drooid AE to warm leads (identified via survey/engagement)
- Day 14: Invite engaged prospects to 15-min intro call
- Day 21: Final reminder email before nurture handoff to sales

Metrics to Track:
- Registration rate vs. promotion spend
- Live attendance rate
- Engagement metrics (questions asked, chat activity)
- Email open rates (follow-up sequence)
- Demo request rate / inbound pipeline impact
- Cost per lead generated

Webinar themes (rotate monthly):
1. AI Agents in Sales (demos, case studies)
2. Reducing Customer Onboarding Time with Automation
3. Technical Debt and AI-Assisted Refactoring
4. Building Better Data Pipelines with Agent Orchestration
5. From RFP Chaos to AI-Powered Sales Process
6. Infrastructure for AI Agent Orchestration`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      webinar_topic = '',
      target_company_size = '$10M-$100M ARR',
      industry_focus = '',
      speaker_bios = [],
      promotion_channels = ['linkedin', 'email', 'twitter'],
      event_date = null,
    } = context;

    if (!webinar_topic && !event_date) {
      throw new Error('Must provide either webinar_topic or event_date');
    }

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      topic: webinar_topic,
      target_size: target_company_size,
      industry: industry_focus,
    });

    // 2. Fetch recent webinar performance data for benchmarking
    const performanceQuery = await db.query(
      `SELECT event_name, registrations, attendees, demo_requests, pipeline_generated
       FROM events
       WHERE event_type = 'webinar' AND created_at > NOW() - INTERVAL '6 months'
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const recentPerformance = performanceQuery.rows || [];

    // Calculate benchmarks
    const avgRegistrations = recentPerformance.length
      ? recentPerformance.reduce((sum, e) => sum + (e.registrations || 0), 0) / recentPerformance.length
      : 0;

    // 3. Build prompt for Gemini
    const userPrompt = `Create a comprehensive webinar/event plan for Drooid with these parameters:

Webinar Topic: ${webinar_topic}
Target Company Size: ${target_company_size}
Industry Focus: ${industry_focus}
Proposed Date: ${event_date || 'TBD - recommended within 4 weeks'}
Promotion Channels: ${promotion_channels.join(', ')}
Speaker Bios Available: ${speaker_bios.length > 0 ? speaker_bios.join('; ') : 'Use Drooid founder/CTO as primary speaker'}

Recent Benchmark Performance:
- Average registrations: ${Math.round(avgRegistrations)}
- Historical demo request rate: 8-12%
- Historical pipeline generated: $50K-$150K per webinar

Create a complete event plan including:

1. Event Overview
   - Clear, compelling event title (not generic)
   - Event description (150 words max, focus on what attendees will learn)
   - Specific learning outcomes (3-4 tangible takeaways)
   - Target personas (titles, pain points, buying criteria)

2. Speaker Strategy
   - Primary speaker profile and talking points (30 min)
   - Co-speaker or guest host recommendations
   - Key talking points (mix of education, Drooid approach, CTA)
   - Demo outline (if applicable)

3. Content/Agenda
   - Detailed 45-minute agenda breakdown (including Q&A, CTA)
   - Slide outline (major sections)
   - Live demo script (if applicable)
   - Discussion questions for live Q&A

4. Registration Page
   - Compelling headline
   - Value prop copy (why should they register?)
   - Form fields (company, title, use case, budget indication)
   - Urgency element (limited spots, exclusive content)

5. Promotion Plan (3-week pre-launch)
   - Week 1 (3 weeks out): messaging, channels, content pieces
   - Week 2 (2 weeks out): messaging, channels, content pieces
   - Week 3 (1 week out): messaging, channels, content pieces
   - Specific LinkedIn posts, email subject lines, Twitter copy
   - Influencer/partner outreach strategy

6. Follow-up Sequence
   - Day 0 email (immediately post-webinar)
   - Day 1 email (key takeaways, resources)
   - Day 3 email (case study/resource)
   - Day 7 email (Drooid AE intro)
   - Day 14 email (demo offer)
   - Day 21 email (final touch before sales)
   - Survey questions (identify buying signals)

7. Success Metrics & Goals
   - Registration goal: X registrants
   - Live attendance target: X attendees
   - Demo request goal: X demo requests
   - Expected pipeline impact: $X
   - Success criteria per metric

8. Execution Checklist
   - Pre-webinar tasks (AV test, slides, speaker prep, etc.)
   - Day-of tasks
   - Post-webinar tasks

Output as JSON:
{
  "event_title": "...",
  "event_description": "...",
  "learning_outcomes": [...],
  "target_personas": [...],
  "event_date": "...",
  "event_time_utc": "...",
  "duration_minutes": 45,
  "speaker_strategy": {
    "primary_speaker": { "name": "...", "role": "...", "bio": "..." },
    "co_speaker": { "name": "...", "role": "...", "bio": "..." },
    "key_talking_points": [...]
  },
  "agenda": [
    { "segment": "...", "duration_minutes": 0, "owner": "...", "description": "..." }
  ],
  "slide_outline": [
    { "slide_number": 1, "title": "...", "key_points": [...] }
  ],
  "demo_script": "...",
  "registration_page": {
    "headline": "...",
    "value_prop": "...",
    "form_fields": [...],
    "urgency_copy": "..."
  },
  "promotion_plan": {
    "week_1": { "message": "...", "channels": [...], "content_pieces": [...] },
    "week_2": { "message": "...", "channels": [...], "content_pieces": [...] },
    "week_3": { "message": "...", "channels": [...], "content_pieces": [...] }
  },
  "email_sequence": [
    { "send_day": 0, "subject": "...", "preview": "...", "cta": "..." }
  ],
  "survey_questions": [...],
  "success_metrics": {
    "registration_goal": 0,
    "attendance_goal": 0,
    "demo_request_goal": 0,
    "pipeline_goal": 0
  },
  "execution_checklist": { "pre_event": [...], "during": [...], "post_event": [...] }
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let eventPlan;
    try {
      eventPlan = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!eventPlan.event_title || !eventPlan.learning_outcomes) {
      throw new Error('Gemini response missing required event planning data');
    }

    // 5. Store in Supabase
    const eventRecord = await db.query(
      `INSERT INTO events (
        event_name, event_type, description, event_date, target_personas,
        event_data, status, requires_approval
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at`,
      [
        eventPlan.event_title,
        'webinar',
        eventPlan.event_description,
        eventPlan.event_date || event_date,
        JSON.stringify(eventPlan.target_personas),
        JSON.stringify(eventPlan),
        'planning',
        true,
      ]
    );

    if (!eventRecord.rows.length) {
      throw new Error('Failed to insert event record');
    }

    const eventId = eventRecord.rows[0].id;

    // 6. Store promotion plan as content
    for (const week of ['week_1', 'week_2', 'week_3']) {
      const weekData = eventPlan.promotion_plan[week];
      await db.query(
        `INSERT INTO content (
          type, title, body, event_id, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          'event_promotion',
          `${eventPlan.event_title} - ${week.replace('_', ' ').toUpperCase()}`,
          JSON.stringify(weekData),
          eventId,
          'draft',
        ]
      );
    }

    // 7. Store email sequence
    for (const emailIndex in eventPlan.email_sequence) {
      const email = eventPlan.email_sequence[emailIndex];
      await db.query(
        `INSERT INTO content (
          type, title, body, event_id, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          'event_email',
          `${eventPlan.event_title} - Day ${email.send_day}`,
          JSON.stringify(email),
          eventId,
          'draft',
        ]
      );
    }

    // 8. Create approval record
    const approvalRecord = await db.query(
      `INSERT INTO approvals (event_id, type, status, reviewer_role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [eventId, 'event_plan', 'pending', 'marketing']
    );

    // 9. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      event_id: eventId,
      approval_id: approvalRecord.rows[0].id,
      event_title: eventPlan.event_title,
      registration_goal: eventPlan.success_metrics.registration_goal,
    });

    return {
      success: true,
      event_id: eventId,
      approval_id: approvalRecord.rows[0].id,
      event_title: eventPlan.event_title,
      event_date: eventPlan.event_date,
      learning_outcomes: eventPlan.learning_outcomes,
      registration_goal: eventPlan.success_metrics.registration_goal,
      demo_request_goal: eventPlan.success_metrics.demo_request_goal,
      pipeline_goal: eventPlan.success_metrics.pipeline_goal,
      status: 'event_plan_pending_approval',
      message: 'Event plan created and queued for marketing approval',
      checklist_items: eventPlan.execution_checklist.pre_event.length,
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
