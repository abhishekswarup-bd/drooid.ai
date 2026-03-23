const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-17';
const AGENT_NAME = 'Testimonial Collector';
const SYSTEM_PROMPT = `You are a customer success storyteller who collects testimonials and case study material from satisfied clients. Your mission is to turn successful deployments into proof points that win future deals.

The right moment matters: wait until the client has realized measurable value (usually 4-6 weeks post-go-live). Don't ask too early — they need to have experienced the benefit firsthand. Client satisfaction is signal #1.

Request methods vary: testimonial request with guided questions (easiest — give them a template), LinkedIn recommendation request (low friction, visible to network), case study interview (deeper but more time-intensive), or video testimonial invitation (highest impact, requires most comfort).

Match method to relationship: long-standing client can do case study, newer client can do testimonial, every client can be asked for a LinkedIn recommendation. Respect their time and comfort level.

Draft the testimonial for them. Make it easy by providing suggested text they can edit. Include: specific outcome metrics if they have them (30% efficiency gain, X hours saved per week), business impact in their language, what surprised them positively, specific features that mattered most, recommendation statement.

The tone is authentic — real client voice, not marketing copy. Avoid generic praise. Specific is credible. "They delivered 35% faster than expected" beats "great results." "The custom workflow saved our team 8 hours per week" beats "very efficient."

When a client agrees to testimonial, get it in writing quickly. Create the case study record, draft the case study structure, and get approval from client before publishing.

Return valid JSON:
{
  "contact_id": "uuid",
  "contact_name": "First Last",
  "company_name": "Company Name",
  "deal_id": "pipeline_id",
  "request_type": "testimonial|linkedin_recommendation|case_study|video_testimonial",
  "request_subject": "Subject line",
  "request_message": "Full request message",
  "suggested_testimonial_draft": "Draft they can edit",
  "success_probability": 0.72,
  "expected_content": "What we expect to get",
  "value_for_sales": "How this helps close deals",
  "follow_up_timing": "When to follow up if no response",
  "personalization_notes": "What makes this specific to them",
  "case_study_potential": true
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'testimonial_collection_start',
      context: { scope: 'satisfied_clients' }
    });

    // 1. Fetch recently closed won deals (30+ days, client had time to use)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentWins, error: winsError } = await db
      .from('pipeline')
      .select('*, leads(company_name, industry, website)')
      .eq('stage', 'closed_won')
      .lte('updated_at', thirtyDaysAgo) // Closed 30+ days ago
      .gte('updated_at', ninetyDaysAgo) // But within 90 days (not ancient)
      .order('updated_at', { ascending: false });

    if (winsError) {
      throw new Error(`Failed to fetch recent wins: ${winsError.message}`);
    }

    if (!recentWins || recentWins.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'No clients in ideal testimonial window (30-90 days post-close)',
        requests_generated: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 2. Get contacts for these deals
    const leadIds = recentWins.map(w => w.lead_id);
    const { data: contacts } = await db
      .from('contacts')
      .select('*')
      .in('lead_id', leadIds);

    // 3. Filter for testimonial candidates
    const testimonialCandidates = [];

    for (const win of recentWins) {
      const winContacts = contacts?.filter(c => c.lead_id === win.lead_id) || [];

      for (const contact of winContacts) {
        // Skip if already collected testimonial recently
        const { data: existingTestimonials } = await db
          .from('outreach')
          .select('created_at')
          .eq('contact_id', contact.id)
          .in('message_type', ['testimonial_request', 'case_study'])
          .order('created_at', { ascending: false })
          .limit(1);

        const recentlyAsked = existingTestimonials?.[0]
          ? new Date(existingTestimonials[0].created_at) > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
          : false;

        if (!recentlyAsked) {
          testimonialCandidates.push({
            ...contact,
            deal: win,
            days_since_close: Math.floor(
              (Date.now() - new Date(win.updated_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          });
        }
      }
    }

    if (testimonialCandidates.length === 0) {
      return {
        success: true,
        agent_id: AGENT_ID,
        message: 'No new testimonial candidates (all recently asked)',
        requests_generated: 0,
        duration_ms: Date.now() - startTime
      };
    }

    // 4. Generate testimonial requests for candidates
    const requests = [];

    for (const candidate of testimonialCandidates.slice(0, 15)) {
      try {
        const contactName = `${candidate.first_name} ${candidate.last_name}`;
        const companyName = candidate.deal?.leads?.company_name || 'Company';
        const industry = candidate.deal?.leads?.industry || 'their industry';
        const dealValue = candidate.deal?.deal_value || 0;

        const testimonialPrompt = `Generate a testimonial/case study collection request for this satisfied client:

CLIENT INFO:
- Name: ${contactName}
- Title: ${candidate.title || 'Unknown'}
- Company: ${companyName}
- Industry: ${industry}
- Email: ${candidate.email}

DEAL CONTEXT:
- Deal Value: $${dealValue}
- Days Since Close: ${Math.floor((Date.now() - new Date(candidate.deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))}
- Deal Notes: ${candidate.deal?.notes?.substring(0, 200) || 'Not provided'}

REQUEST OPTIONS:
1. Testimonial request with guided questions (easiest)
2. LinkedIn recommendation request (low friction)
3. Case study interview request (deeper)
4. Video testimonial invitation (highest impact)

CHOOSE THE BEST METHOD FOR THIS CLIENT:
- Use testimonial request if they're engaged but time-limited
- Use LinkedIn if they're active on LinkedIn and want visibility
- Use case study if they're enthusiastic and have metrics
- Use video if they're comfortable on camera (usually C-level or senior)

GENERATE:
1. Request type selection with reasoning
2. Personalized request message (warm, specific, respectful of time)
3. Suggested testimonial draft they can edit (include metrics, outcomes, recommendation)
4. Talking points about what makes their story valuable
5. Probability of getting testimonial
6. Case study potential assessment

TESTIMONIAL SHOULD INCLUDE:
- Their specific challenge before (1 sentence)
- Business outcome/metrics after (quantified if possible)
- What surprised them positively
- Specific features that mattered
- Who they'd recommend Drooid to
- Their recommendation statement

Make the draft real and credible. No marketing fluff. Real client voice.`;

        const geminiResponse = await callGemini({
          system: SYSTEM_PROMPT,
          prompt: testimonialPrompt,
          temperature: 0.5,
          timeout: 25000
        });

        if (!geminiResponse?.content) {
          console.warn(`No response for contact ${candidate.id}`);
          continue;
        }

        let testimonialData = {};
        try {
          const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            testimonialData = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.warn(`Parse error for contact ${candidate.id}`);
          continue;
        }

        // 5. Store testimonial request in outreach table
        const requestType = testimonialData.request_type || 'testimonial';
        const { data: outreachRecord, error: outreachError } = await db
          .from('outreach')
          .insert({
            lead_id: candidate.lead_id,
            contact_id: candidate.id,
            outreach_type: 'email',
            message_type:
              requestType === 'case_study' ? 'case_study' : 'testimonial_request',
            subject: testimonialData.request_subject || `We'd love to share your success story`,
            message: testimonialData.request_message || '',
            status: 'pending_approval',
            channel: 'email',
            created_by: AGENT_ID,
            metadata: {
              request_type: requestType,
              success_probability: testimonialData.success_probability,
              suggested_draft: testimonialData.suggested_testimonial_draft,
              case_study_potential: testimonialData.case_study_potential,
              company_name: companyName,
              deal_value: dealValue
            }
          });

        if (outreachError) {
          console.warn(`Outreach storage error: ${outreachError.message}`);
          continue;
        }

        // 6. Create case study record if high potential
        if (testimonialData.case_study_potential && outreachRecord) {
          const { error: caseStudyError } = await db
            .from('content')
            .insert({
              type: 'case_study',
              title: `Case Study: ${companyName}`,
              body: JSON.stringify(
                {
                  company: companyName,
                  industry,
                  challenge: testimonialData.expected_content?.substring(0, 300) || '',
                  results: 'Pending client confirmation',
                  testimonial_draft: testimonialData.suggested_testimonial_draft,
                  status: 'pending_collection'
                },
                null,
                2
              ),
              lead_id: candidate.lead_id,
              contact_id: candidate.id,
              created_by: AGENT_ID,
              metadata: {
                outreach_id: outreachRecord[0].id,
                request_type: requestType,
                contact_name: contactName
              }
            });

          if (caseStudyError) {
            console.warn(`Case study creation warning: ${caseStudyError.message}`);
          }
        }

        requests.push({
          contact_id: candidate.id,
          contact_name: contactName,
          company: companyName,
          request_type: requestType,
          success_probability: testimonialData.success_probability || 0.65,
          case_study_potential: testimonialData.case_study_potential || false,
          outreach_id: outreachRecord?.[0]?.id
        });

      } catch (candidateError) {
        console.warn(`Error processing candidate ${candidate.id}:`, candidateError.message);
        continue;
      }
    }

    // 7. Create approval records (CEO/marketing needs to review before sending)
    const approvalBatch = requests.slice(0, 15).map(req => ({
      type: 'testimonial_request',
      contact_id: req.contact_id,
      status: 'pending',
      requester_id: AGENT_ID,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }));

    if (approvalBatch.length > 0) {
      const { error: approvalError } = await db
        .from('approvals')
        .insert(approvalBatch);

      if (approvalError) {
        console.warn(`Approval creation warning: ${approvalError.message}`);
      }
    }

    // 8. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'testimonial_collection_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        candidates_identified: testimonialCandidates.length,
        requests_generated: requests.length,
        case_study_potential: requests.filter(r => r.case_study_potential).length
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      candidates_identified: testimonialCandidates.length,
      requests_generated: requests.length,
      requests: requests,
      case_study_candidates: requests.filter(r => r.case_study_potential).length,
      pending_approval_count: requests.length,
      next_step: 'CEO/Marketing review and approval before sending',
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'testimonial_collection_failed',
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
