const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-16';
const AGENT_NAME = 'Referral Generator';
const SYSTEM_PROMPT = `You are a referral strategy specialist who identifies the perfect moment and method to ask for referrals from satisfied customers and warm contacts. Your goal is to unlock the fastest, highest-quality leads — the ones that already have trust and context.

Referral readiness criteria: the prospect closed successfully and expressed satisfaction (case study participant, testimonial giver, strong engagement), or the contact engaged positively even if they didn't close (high touches, responsive, interested but not ready). Never ask from cold contacts or people who've gone dark.

Referral request methods vary: a direct, warm ask ("I'd love to talk to similar companies you know"), LinkedIn recommendation request (easier, low friction), case study participation (which naturally leads to referral offers), or mutual introduction request ("Who should I talk to about X?"). Match the method to the relationship and contact style.

The tone is genuine and non-transactional. You're asking because you genuinely want to help other companies solve their problems, and the person you're asking would enjoy connecting. Never feel transactional or sales-y. Make it easy for them to help you.

Timing matters: close a deal successfully, get positive feedback, then ask within 1-2 weeks while they're still excited and the solution is fresh. For engaged non-customers, ask after strong engagement peaks (they replied to multiple emails, opened everything, showed interest).

Craft personalized referral requests that reference their specific success or engagement. Draft suggested talking points for how they could introduce you ("I work with companies like yours..."). If they ask who you're looking for, have a clear profile ready.

Return valid JSON:
{
  "contact_id": "uuid",
  "contact_name": "First Last",
  "company": "Company Name",
  "relationship_type": "closed_customer|engaged_prospect|case_study_candidate",
  "referral_request_type": "direct_ask|linkedin_recommendation|case_study|mutual_introduction",
  "readiness_score": 0.85,
  "message_subject": "Subject if email",
  "message_body": "Full personalized request message",
  "suggested_talking_points": ["point1", "point2"],
  "target_profile": "Profile of who they might refer",
  "expected_response_time": "2-5 days",
  "follow_up_timing": "If no response, follow up in 7 days",
  "success_probability": 0.65,
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
      action: 'referral_generation_start',
      context: { scope: 'customers_and_engaged_prospects' }
    });

    // 1. Fetch recently closed won deals (last 60 days)
    const closedWonDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentWins, error: winsError } = await db
      .from('pipeline')
      .select('*, leads(company_name, industry)')
      .eq('stage', 'closed_won')
      .gte('updated_at', closedWonDate)
      .order('updated_at', { ascending: false });

    if (winsError) {
      throw new Error(`Failed to fetch wins: ${winsError.message}`);
    }

    // 2. Fetch highly engaged prospects (not yet customers)
    const { data: engagedProspects, error: engagedError } = await db
      .from('pipeline')
      .select('*, leads(company_name, industry)')
      .neq('stage', 'closed_won')
      .neq('stage', 'closed_lost')
      .neq('stage', 'prospecting')
      .gte('probability', 0.3);

    if (engagedError) {
      throw new Error(`Failed to fetch engaged prospects: ${engagedError.message}`);
    }

    // 3. Get contacts for these leads
    const leadIds = [
      ...(recentWins?.map(w => w.lead_id) || []),
      ...(engagedProspects?.map(p => p.lead_id) || [])
    ];

    const { data: contacts, error: contactError } = await db
      .from('contacts')
      .select('*')
      .in('lead_id', leadIds);

    if (contactError) {
      throw new Error(`Failed to fetch contacts: ${contactError.message}`);
    }

    // 4. Filter for referral candidates
    const referralCandidates = [];

    // Process closed won deals
    if (recentWins) {
      for (const win of recentWins) {
        const winContacts = contacts?.filter(c => c.lead_id === win.lead_id) || [];

        for (const contact of winContacts) {
          // Check if they've engaged recently and haven't been asked for referral recently
          const { data: recentEngagement } = await db
            .from('outreach')
            .select('created_at')
            .eq('contact_id', contact.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(5);

          const { data: referralAsks } = await db
            .from('outreach')
            .select('created_at')
            .eq('contact_id', contact.id)
            .eq('message_type', 'referral_ask')
            .order('created_at', { ascending: false })
            .limit(1);

          // Candidate if: recent engagement OR just closed, AND haven't been asked for referral recently
          const recentlyAsked = referralAsks?.[0]
            ? new Date(referralAsks[0].created_at) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            : false;

          if (!recentlyAsked && (recentEngagement?.length > 0 || Math.random() > 0.5)) {
            referralCandidates.push({
              ...contact,
              deal: win,
              relationship_type: 'closed_customer',
              engagement_level: 'high'
            });
          }
        }
      }
    }

    // Process engaged prospects
    if (engagedProspects) {
      for (const prospect of engagedProspects) {
        const prospectContacts = contacts?.filter(c => c.lead_id === prospect.lead_id) || [];

        for (const contact of prospectContacts) {
          const { data: touches } = await db
            .from('outreach')
            .select('*')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false })
            .limit(10);

          // Candidate if: high engagement even without close
          const openedRate = touches?.filter(t => t.metadata?.opened).length / (touches?.length || 1);
          if (openedRate > 0.5 && touches?.length > 3) {
            referralCandidates.push({
              ...contact,
              deal: prospect,
              relationship_type: 'engaged_prospect',
              engagement_level: 'medium'
            });
          }
        }
      }
    }

    if (referralCandidates.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'No qualified referral candidates at this time',
        referrals_generated: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 5. Generate personalized referral requests
    const referrals = [];

    for (const candidate of referralCandidates.slice(0, 20)) {
      try {
        const contactName = `${candidate.first_name} ${candidate.last_name}`;
        const companyName = candidate.deal?.leads?.company_name || 'Company';

        const referralPrompt = `Generate a personalized referral request for this contact:

CONTACT:
- Name: ${contactName}
- Title: ${candidate.title || 'Unknown'}
- Company: ${companyName}
- Email: ${candidate.email}

RELATIONSHIP:
- Type: ${candidate.relationship_type}
- Engagement Level: ${candidate.engagement_level}
- Industry: ${candidate.deal?.leads?.industry || 'Technology'}

REQUEST TYPE:
Choose the best method: direct_ask, linkedin_recommendation, case_study, or mutual_introduction

PERSONALIZATION:
Reference something specific about them or their company. Show you know them. Make it genuine.

MESSAGE:
1. Personalized, warm, non-transactional
2. Reference their specific situation or success
3. Make the ask clear but easy to say no to
4. Suggest talking points if they do refer
5. Define ideal referral profile
6. No pressure

OUTPUT:
JSON with: request_type, message_subject, message_body, suggested_talking_points, target_profile, readiness_score, success_probability

This is a real person. Make it genuine.`;

        const geminiResponse = await callGemini({
          system: SYSTEM_PROMPT,
          prompt: referralPrompt,
          temperature: 0.5,
          timeout: 20000
        });

        if (!geminiResponse?.content) {
          console.warn(`No response for contact ${candidate.id}`);
          continue;
        }

        let referralData = {};
        try {
          const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            referralData = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.warn(`Parse error for contact ${candidate.id}`);
          continue;
        }

        // 6. Store referral request in outreach table
        const { data: outreachRecord, error: outreachError } = await db
          .from('outreach')
          .insert({
            lead_id: candidate.lead_id,
            contact_id: candidate.id,
            outreach_type: 'email',
            message_type: 'referral_ask',
            subject: referralData.message_subject || `Let's help more companies like ${companyName}`,
            message: referralData.message_body || '',
            status: 'pending_approval',
            channel: 'email',
            created_by: AGENT_ID,
            metadata: {
              request_type: referralData.referral_request_type,
              readiness_score: referralData.readiness_score || 0.7,
              target_profile: referralData.target_profile,
              relationship_type: candidate.relationship_type
            }
          });

        if (outreachError) {
          console.warn(`Outreach storage error: ${outreachError.message}`);
          continue;
        }

        referrals.push({
          contact_id: candidate.id,
          contact_name: contactName,
          company: companyName,
          request_type: referralData.referral_request_type,
          readiness_score: referralData.readiness_score,
          outreach_id: outreachRecord?.[0]?.id
        });

      } catch (candidateError) {
        console.warn(`Error processing candidate ${candidate.id}:`, candidateError.message);
        continue;
      }
    }

    // 7. Create approval records for outbound referral requests
    // (These need CEO/sales leader approval before sending)
    const { data: approvalRecords, error: approvalError } = await db
      .from('approvals')
      .insert(
        referrals.slice(0, 10).map(ref => ({
          type: 'referral_request',
          contact_id: ref.contact_id,
          status: 'pending',
          requester_id: AGENT_ID,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }))
      );

    if (approvalError) {
      console.warn(`Approval creation warning: ${approvalError.message}`);
    }

    // 8. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'referral_generation_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        candidates_identified: referralCandidates.length,
        referrals_generated: referrals.length,
        pending_approval: referrals.length
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      candidates_identified: referralCandidates.length,
      referrals_generated: referrals.length,
      referrals: referrals,
      pending_approval_count: referrals.length,
      next_step: 'CEO review and approval before sending',
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'referral_generation_failed',
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
