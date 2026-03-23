const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-13';
const AGENT_NAME = 'Nurture Agent';
const SYSTEM_PROMPT = `You are a relationship-building specialist focused on nurturing warm leads who showed genuine interest but aren't yet ready to buy. Your mission is to keep them engaged and progressing toward sales readiness by providing genuine, valuable touchpoints.

Each nurture touchpoint you design serves a specific purpose: share industry insights relevant to their challenges, offer a helpful case study from a similar company, provide thought leadership content from Drooid on emerging AI trends, invite them to a relevant event or webinar, share a helpful resource or tool, or ask a thoughtful question that helps them think through their challenges.

The key principle: never push. Never ask for a meeting or try to advance the deal. Instead, let value build trust. Engagement will rise naturally as you provide genuine help. You're not selling, you're consulting. You're not chasing, you're helping them solve problems on their timeline.

Track what works: monitor opens, clicks, replies on every touchpoint. When engagement rises, buying signals emerge, or they reply with interest, that's the signal to switch to a more direct sales motion. Until then, nurture mode is your posture.

Frequency matters: space touches 1-2 weeks apart, never more than once per week. Timing matters: send Tuesday-Thursday mornings, avoid Mondays and Fridays. Channels matter: mix email, LinkedIn posts they might see, and occasional direct messages, but email is primary.

Return valid JSON:
{
  "contact_id": "uuid",
  "company_name": "Company Name",
  "contact_name": "First Last",
  "touchpoint_type": "case_study|insight|thought_leadership|event|resource|question",
  "subject_line": "Compelling subject if email",
  "message_body": "The full message/content to send",
  "channel": "email|linkedin|message",
  "scheduled_send_time": "YYYY-MM-DDTHH:MM:SS",
  "expected_send_day": "Tuesday|Wednesday|Thursday",
  "success_metrics": ["metric1", "metric2"],
  "cta_present": false,
  "cta_type": null,
  "follow_up_trigger": "When to send next touch: engagement_signal|7_days|14_days|30_days",
  "personalization_notes": "What makes this specific to them"
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'nurture_campaign_start',
      context: { scope: 'nurture_stage_contacts' }
    });

    // 1. Fetch all contacts in nurture stage
    const { data: nurtureContacts, error: fetchError } = await db
      .from('contacts')
      .select('*, leads(company_name, industry, website, lead_score)')
      .eq('stage', 'nurture')
      .order('last_engagement', { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(`Failed to fetch nurture contacts: ${fetchError.message}`);
    }

    if (!nurtureContacts || nurtureContacts.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'No contacts in nurture stage',
        touchpoints_created: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 2. Filter out contacts who have recent outreach (avoid over-nurturing)
    const contactsNeedingNurture = await Promise.all(
      nurtureContacts.map(async (contact) => {
        const { data: recentOutreach } = await db
          .from('outreach')
          .select('created_at')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentOutreach && recentOutreach.length > 0) {
          const lastOutreachDate = new Date(recentOutreach[0].created_at);
          const daysSince = Math.floor(
            (Date.now() - lastOutreachDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Only nurture if 7+ days since last touch
          if (daysSince < 7) {
            return null;
          }
        }

        return contact;
      })
    );

    const readyForNurture = contactsNeedingNurture.filter(Boolean);

    if (readyForNurture.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'All nurture contacts were touched recently',
        touchpoints_created: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 3. Generate nurture touchpoints for each contact
    const touchpoints = [];

    for (const contact of readyForNurture.slice(0, 15)) {
      // Limit to 15 per run to manage API load
      try {
        const companyName = contact.leads?.company_name || 'Company';
        const industry = contact.leads?.industry || 'Technology';
        const contactName = `${contact.first_name} ${contact.last_name}`;

        const nurturePrompt = `Generate a single nurture touchpoint for this contact who showed interest but isn't yet sales-ready:

CONTACT INFO:
- Name: ${contactName}
- Title: ${contact.title || 'Unknown'}
- Company: ${companyName}
- Industry: ${industry}
- Contact Stage: Nurture
- Email: ${contact.email}

ENGAGEMENT HISTORY:
- Days since last outreach: [varies]
- Interaction frequency: [moderate interest shown]
- Content they engaged with: [value-focused, not sales-focused]

TOUCHPOINT GUIDELINES:
1. Choose ONE touchpoint type: case study from similar company, industry insight, Drooid thought leadership, event invitation, helpful resource, or thoughtful question
2. Make it completely value-first - zero sales pressure
3. Reference something specific to their industry or company size
4. Never ask for a meeting or push for progression
5. Keep email subject short and curious (not clickbaity)
6. Message should feel like a helpful colleague sharing something useful
7. Schedule for Tuesday-Thursday morning
8. Optimize for opens/clicks/engagement, not conversions

Provide the complete touchpoint as structured JSON.`;

        const geminiResponse = await callGemini({
          system: SYSTEM_PROMPT,
          prompt: nurturePrompt,
          temperature: 0.5,
          timeout: 20000
        });

        if (!geminiResponse?.content) {
          console.warn(`No response for contact ${contact.id}`);
          continue;
        }

        // Parse JSON from response
        let touchpoint = {};
        try {
          const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            touchpoint = JSON.parse(jsonMatch[0]);
          } else {
            console.warn(`No JSON in response for contact ${contact.id}`);
            continue;
          }
        } catch (parseError) {
          console.warn(`Parse error for contact ${contact.id}:`, parseError.message);
          continue;
        }

        // 4. Calculate optimal send time (Tuesday-Thursday, 9am-11am local)
        const now = new Date();
        let scheduledSend = new Date(now);

        // Find next optimal day (Tue=2, Wed=3, Thu=4)
        const currentDay = scheduledSend.getDay();
        if (currentDay === 0 || currentDay === 1) {
          // Sunday or Monday -> Tuesday
          scheduledSend.setDate(scheduledSend.getDate() + (2 - currentDay));
        } else if (currentDay >= 5) {
          // Friday or later -> next Tuesday
          scheduledSend.setDate(scheduledSend.getDate() + (9 - currentDay));
        }

        // Set to 9am
        scheduledSend.setHours(9, 0, 0, 0);

        // 5. Store touchpoint in outreach table
        const { data: outreachRecord, error: outreachError } = await db
          .from('outreach')
          .insert({
            lead_id: contact.lead_id,
            contact_id: contact.id,
            outreach_type: 'email',
            message_type: 'nurture',
            subject: touchpoint.subject_line || `Thought for you, ${contact.first_name}`,
            message: touchpoint.message_body || '',
            status: 'scheduled',
            scheduled_at: scheduledSend.toISOString(),
            channel: touchpoint.channel || 'email',
            created_by: AGENT_ID,
            metadata: {
              touchpoint_type: touchpoint.touchpoint_type || 'insight',
              personalization: touchpoint.personalization_notes,
              follow_up_trigger: touchpoint.follow_up_trigger,
              cta_present: touchpoint.cta_present || false
            }
          });

        if (outreachError) {
          console.warn(`Failed to store outreach: ${outreachError.message}`);
          continue;
        }

        // 6. Create engagement tracking record
        if (outreachRecord) {
          await db
            .from('engagement_tracking')
            .insert({
              outreach_id: outreachRecord[0].id,
              contact_id: contact.id,
              event_type: 'scheduled',
              timestamp: new Date().toISOString(),
              metrics: {
                expected_open_rate: 0.25,
                expected_click_rate: 0.08
              }
            });
        }

        touchpoints.push({
          contact_id: contact.id,
          contact_name: contactName,
          company: companyName,
          touchpoint_type: touchpoint.touchpoint_type,
          scheduled_send: scheduledSend.toISOString(),
          outreach_id: outreachRecord?.[0]?.id
        });

      } catch (contactError) {
        console.warn(`Error generating touchpoint for contact ${contact.id}:`, contactError.message);
        continue;
      }
    }

    // 7. Log campaign completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'nurture_campaign_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        contacts_analyzed: readyForNurture.length,
        touchpoints_created: touchpoints.length
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      contacts_analyzed: readyForNurture.length,
      touchpoints_created: touchpoints.length,
      touchpoints: touchpoints,
      next_run_recommendation: '24 hours',
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'nurture_campaign_failed',
        parent_action_id: action_id,
        error: error.message,
        duration_ms: Date.now() - startTime
      });
    }

    return {
      success: false,
      agent_id: AGENT_ID,
      error: error.message,
      duration_ms: Date.now() - startTime
    };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
