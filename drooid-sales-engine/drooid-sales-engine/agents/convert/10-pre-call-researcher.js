const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-10';
const AGENT_NAME = 'Pre-Call Researcher';
const SYSTEM_PROMPT = `You are a senior pre-call research analyst specializing in preparing executives for high-stakes sales meetings. Your role is to compile comprehensive, actionable briefing dossiers that can be reviewed in 5 minutes flat.

For each meeting, you conduct deep research across multiple dimensions: prospect company's recent news and announcements (last 90 days), key leadership changes, competitive landscape and recent competitor movements, their technology stack and integration capabilities, industry trends affecting their business, likely pain points based on company size/industry/stage, common objections for their industry segment, and conversation starters that demonstrate homework.

Your briefing format is structured for rapid consumption by busy executives. Every section has a specific purpose: the executive summary delivers the core intelligence in 2-3 sentences, talking points are specific and defensible (never generic), questions are designed to uncover budget/authority/timeline, and competitive context shows how they stack against their current solutions.

You write with confidence and specificity. Never speculate without flagging it as assumption. Always cite your sources or note when information is industry-standard knowledge. The tone is professional but conversational — the CEO reading this should feel they walk into the meeting fully prepared but not over-scripted.

Return valid JSON with this exact structure:
{
  "exec_summary": "3-sentence overview of prospect and meeting context",
  "company_updates": [{"date": "YYYY-MM", "update": "specific news", "relevance": "why it matters"}],
  "talking_points": [{"point": "specific talking point", "evidence": "why/how", "category": "value|capability|fit"}],
  "questions_to_ask": [{"question": "specific question", "purpose": "what you'll learn", "context": "why now"}],
  "potential_objections": [{"objection": "likely objection", "reframe": "how to address it", "evidence": "supporting point"}],
  "competitive_context": "paragraph on competitive landscape and how Drooid differentiates",
  "recommended_approach": "2-3 sentence recommendation for how to run this specific meeting",
  "research_quality": {"sources_checked": ["linkedin", "press", "industry", "company_site"], "confidence": 0.85, "notes": "any gaps in research"}
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    const { lead_id, contact_id, meeting_details = {} } = context;

    if (!lead_id) {
      throw new Error('lead_id required in context');
    }

    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'pre_call_research_start',
      context: { lead_id, contact_id, meeting_details }
    });

    // 1. Fetch lead and contact data
    const { data: lead, error: leadError } = await db
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Failed to fetch lead ${lead_id}: ${leadError?.message}`);
    }

    let contact = null;
    if (contact_id) {
      const { data: contactData, error: contactError } = await db
        .from('contacts')
        .select('*')
        .eq('id', contact_id)
        .single();

      if (contactError) {
        console.warn(`Contact fetch warning: ${contactError.message}`);
      } else {
        contact = contactData;
      }
    }

    // 2. Fetch associated pipeline record for context
    const { data: pipelineRecords } = await db
      .from('pipeline')
      .select('*')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(1);

    const pipeline = pipelineRecords?.[0];

    // 3. Build research context prompt
    const companyName = lead.company_name || 'Unknown Company';
    const industry = lead.industry || 'Technology';
    const employeeCount = lead.employee_count || 'N/A';
    const contactName = contact?.first_name + ' ' + contact?.last_name || 'prospect';
    const contactTitle = contact?.title || 'stakeholder';
    const meetingDate = meeting_details.date || new Date().toISOString().split('T')[0];
    const meetingTopic = meeting_details.topic || 'Sales meeting';

    const researchPrompt = `Conduct a comprehensive pre-call research brief for this meeting:

PROSPECT INFO:
- Company: ${companyName}
- Industry: ${industry}
- Size: ~${employeeCount} employees
- Contact: ${contactName} (${contactTitle})
- Meeting Date: ${meetingDate}
- Meeting Topic: ${meetingTopic}

CURRENT CONTEXT:
- Lead Score: ${lead.lead_score || 'N/A'}
- Company Website: ${lead.website || 'Not provided'}
- Company Details: ${lead.company_description || 'Not provided'}
- Previous Interactions: ${pipeline?.notes ? 'Yes, see notes' : 'Cold outreach'}

INSTRUCTIONS:
1. Research this company's recent news (last 90 days) - look for funding, product launches, expansion, acquisitions
2. Identify their technology stack and current tools - what problems they're likely solving for
3. Analyze industry trends affecting businesses like theirs
4. Map potential pain points based on company size, industry, and growth stage
5. Prepare talking points that demonstrate you understand their specific business
6. Craft questions that uncover budget, authority, timeline, and buying process
7. Anticipate objections common in their industry
8. Position Drooid's value in context of their likely needs

Be specific and evidence-based. Never generic. The executive reading this needs to walk in fully prepared.`;

    // 4. Call Gemini with research prompt
    const geminiResponse = await callGemini({
      system: SYSTEM_PROMPT,
      prompt: researchPrompt,
      temperature: 0.3,
      timeout: 30000
    });

    if (!geminiResponse?.content) {
      throw new Error('No response from Gemini');
    }

    // 5. Parse and validate JSON output
    let briefing = {};
    try {
      // Extract JSON from response
      const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      briefing = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      // Fallback: create structured output from text response
      briefing = {
        exec_summary: geminiResponse.content.substring(0, 300),
        company_updates: [],
        talking_points: [],
        questions_to_ask: [],
        potential_objections: [],
        competitive_context: geminiResponse.content.substring(300, 600),
        recommended_approach: geminiResponse.content.substring(600, 900),
        research_quality: {
          sources_checked: ['company_site', 'industry'],
          confidence: 0.6,
          notes: 'Parsed from text response'
        }
      };
    }

    // 6. Store briefing in pipeline.notes and create content record
    if (pipeline) {
      const briefingJSON = JSON.stringify(briefing, null, 2);
      const { error: updateError } = await db
        .from('pipeline')
        .update({
          notes: briefingJSON,
          updated_at: new Date().toISOString()
        })
        .eq('id', pipeline.id);

      if (updateError) {
        console.warn(`Failed to update pipeline notes: ${updateError.message}`);
      }
    }

    // Create content record for briefing
    const { error: contentError } = await db
      .from('content')
      .insert({
        type: 'pre_call_brief',
        title: `Pre-Call Brief: ${companyName} - ${contactName}`,
        body: JSON.stringify(briefing, null, 2),
        lead_id,
        contact_id: contact_id || null,
        created_by: AGENT_ID,
        metadata: {
          meeting_date: meetingDate,
          contact_title: contactTitle,
          research_confidence: briefing.research_quality?.confidence || 0.75
        }
      });

    if (contentError) {
      console.warn(`Failed to create content record: ${contentError.message}`);
    }

    // 7. Log action completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'pre_call_research_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        company: companyName,
        briefing_sections: Object.keys(briefing).length,
        confidence: briefing.research_quality?.confidence || 0.75
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      briefing,
      stored_to: {
        pipeline_id: pipeline?.id,
        content_type: 'pre_call_brief'
      },
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'pre_call_research_failed',
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
