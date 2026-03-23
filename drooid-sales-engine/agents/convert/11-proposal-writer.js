const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-11';
const AGENT_NAME = 'Proposal Writer';
const SYSTEM_PROMPT = `You are an expert proposal writer specializing in AI implementation services. Your proposals are custom-built, never templated. They win because they prove you listened and understood the prospect's specific needs.

Your proposals follow a proven structure: (1) Executive Summary that reframes their challenge as an opportunity, (2) Understanding of Needs that mirrors their language and concerns, (3) Proposed Solution with specific Drooid agents/workflows tailored to their requirements, (4) Implementation Timeline with realistic 4-12 week phases, (5) Investment section that frames price as value (ROI metrics, efficiency gains), (6) Team & Expertise showing relevant experience, and (7) Clear Next Steps.

The voice is Drooid brand: confident but not arrogant, technical but accessible to non-technical decision-makers, focused relentlessly on business outcomes not features. You reference their specific challenges, use their terminology, and show how Drooid's agents directly address their stated pain points. Every section should make the reader think "wow, they really get our business."

Tone throughout is professional but warm. Use concrete examples and metrics where possible. Avoid buzzwords. Make the timeline credible and the investment justifiable. Include risk mitigation — show you've thought about potential obstacles.

Your output is markdown-formatted proposal text ready to send (after CEO approval). You also provide a deal_value estimate based on their company size and implied budget, and a win_probability score (0-1) based on how well the proposal aligns with their stated needs.

Return valid JSON:
{
  "proposal_markdown": "# Full proposal text in markdown...",
  "deal_value": 85000,
  "currency": "USD",
  "probability_score": 0.78,
  "proposal_length_words": 2847,
  "key_success_factors": ["factor1", "factor2", "factor3"],
  "risk_factors": ["risk1", "risk2"],
  "next_steps": ["step1", "step2", "step3"]
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    const { lead_id, contact_id, meeting_notes = '', requirements = {} } = context;

    if (!lead_id) {
      throw new Error('lead_id required in context');
    }

    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'proposal_generation_start',
      context: { lead_id, contact_id, requirements_provided: !!requirements.main }
    });

    // 1. Fetch lead and contact data
    const { data: lead, error: leadError } = await db
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error(`Failed to fetch lead: ${leadError?.message}`);
    }

    let contact = null;
    if (contact_id) {
      const { data: contactData } = await db
        .from('contacts')
        .select('*')
        .eq('id', contact_id)
        .single();
      contact = contactData;
    }

    // 2. Fetch pipeline record for context
    const { data: pipelineRecords } = await db
      .from('pipeline')
      .select('*')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(1);

    const pipeline = pipelineRecords?.[0];

    // 3. Fetch recent outreach/meeting notes for context
    const { data: outreach = [] } = await db
      .from('outreach')
      .select('*')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentNotes = outreach
      .map(o => o.notes || o.message)
      .filter(Boolean)
      .join('\n');

    // 4. Build proposal generation prompt
    const companyName = lead.company_name || 'Client';
    const contactName = contact ? `${contact.first_name} ${contact.last_name}` : 'Stakeholder';
    const industry = lead.industry || 'Technology';
    const employeeCount = lead.employee_count || 500;
    const estimatedBudget = requirements.budget || lead.estimated_budget || null;

    const proposalPrompt = `Write a custom proposal for this qualified prospect:

PROSPECT PROFILE:
- Company: ${companyName}
- Industry: ${industry}
- Employee Count: ${employeeCount}
- Primary Contact: ${contactName}
- Website: ${lead.website || 'N/A'}

STATED REQUIREMENTS & NEEDS:
${requirements.main || 'Not yet documented'}

PAIN POINTS IDENTIFIED:
${requirements.pain_points || 'To be uncovered in meeting'}

STATED USE CASE:
${requirements.use_case || 'AI-powered sales automation'}

MEETING NOTES & CONTEXT:
${meeting_notes || recentNotes || 'Initial qualification stage'}

BUDGET CONTEXT:
${estimatedBudget ? `Estimated budget: $${estimatedBudget}` : 'Budget to be determined'}

COMPANY DESCRIPTION:
${lead.company_description || 'Growing technology company'}

INSTRUCTIONS:
1. Write as if you were in the meeting and fully understand their specific challenges
2. Structure: Executive Summary → Understanding of Needs → Proposed Solution → Timeline → Investment → Team → Next Steps
3. Reference their specific industry challenges and terminology
4. Propose specific Drooid agent configurations that solve their stated needs
5. Timeline should be realistic (4-12 weeks typically) with clear phases
6. Investment section should frame price as ROI/value, not just cost
7. Make it feel custom-built, never generic
8. Use confident, warm, technical-but-accessible Drooid voice
9. Include concrete next steps and decision timeline

After the proposal, output a separate JSON block with:
{
  "deal_value": [estimated deal value in USD],
  "probability_score": [0-1 confidence this closes],
  "key_success_factors": ["factor1", "factor2", "factor3"],
  "risk_factors": ["risk1", "risk2"],
  "next_steps": ["step1", "step2", "step3"]
}

Proposal markdown first, then JSON metrics.`;

    // 5. Call Gemini for proposal generation
    const geminiResponse = await callGemini({
      system: SYSTEM_PROMPT,
      prompt: proposalPrompt,
      temperature: 0.4,
      timeout: 45000
    });

    if (!geminiResponse?.content) {
      throw new Error('No response from Gemini');
    }

    // 6. Parse response: markdown proposal + JSON metrics
    let proposalMarkdown = '';
    let metrics = {};

    try {
      // Look for JSON block at the end
      const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        metrics = JSON.parse(jsonMatch[0]);
        proposalMarkdown = geminiResponse.content
          .substring(0, geminiResponse.content.length - jsonMatch[0].length)
          .trim();
      } else {
        proposalMarkdown = geminiResponse.content;
        // Provide sensible defaults
        metrics = {
          deal_value: estimatedBudget || 75000,
          probability_score: 0.65,
          key_success_factors: ['Clear requirements', 'Executive alignment'],
          risk_factors: ['Timeline pressure'],
          next_steps: ['Send proposal', 'Schedule followup']
        };
      }
    } catch (parseError) {
      console.warn('Metrics parsing issue:', parseError.message);
      proposalMarkdown = geminiResponse.content;
      metrics = {
        deal_value: estimatedBudget || 75000,
        probability_score: 0.65,
        key_success_factors: ['Solution fit'],
        risk_factors: [],
        next_steps: ['Send proposal']
      };
    }

    // 7. Create approval record (CEO must review)
    const { data: approval, error: approvalError } = await db
      .from('approvals')
      .insert({
        type: 'proposal_review',
        lead_id,
        contact_id: contact_id || null,
        status: 'pending',
        requester_id: AGENT_ID,
        content: proposalMarkdown,
        metadata: {
          deal_value: metrics.deal_value,
          probability_score: metrics.probability_score,
          key_factors: metrics.key_success_factors,
          risks: metrics.risk_factors
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

    if (approvalError) {
      throw new Error(`Failed to create approval record: ${approvalError.message}`);
    }

    // 8. Create content record
    const { error: contentError } = await db
      .from('content')
      .insert({
        type: 'proposal',
        title: `Proposal: ${companyName}`,
        body: proposalMarkdown,
        lead_id,
        contact_id: contact_id || null,
        created_by: AGENT_ID,
        metadata: {
          deal_value: metrics.deal_value,
          approval_id: approval?.id,
          status: 'pending_approval'
        }
      });

    if (contentError) {
      console.warn(`Content record creation warning: ${contentError.message}`);
    }

    // 9. Update pipeline with proposal stage
    if (pipeline) {
      await db
        .from('pipeline')
        .update({
          stage: 'proposal_sent',
          deal_value: metrics.deal_value,
          probability: metrics.probability_score,
          updated_at: new Date().toISOString()
        })
        .eq('id', pipeline.id);
    }

    // 10. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'proposal_generation_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        company: companyName,
        deal_value: metrics.deal_value,
        probability: metrics.probability_score,
        approval_id: approval?.id,
        proposal_words: proposalMarkdown.split(/\s+/).length
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      proposal_markdown: proposalMarkdown,
      deal_value: metrics.deal_value,
      currency: 'USD',
      probability_score: metrics.probability_score,
      proposal_length_words: proposalMarkdown.split(/\s+/).length,
      key_success_factors: metrics.key_success_factors || [],
      risk_factors: metrics.risk_factors || [],
      next_steps: metrics.next_steps || [],
      approval_id: approval?.id,
      requires_approval: true,
      approval_status: 'pending_ceo_review',
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'proposal_generation_failed',
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
