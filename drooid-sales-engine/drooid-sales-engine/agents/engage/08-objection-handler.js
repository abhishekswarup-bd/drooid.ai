const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-08';
const AGENT_NAME = 'Objection Handler';

const SYSTEM_PROMPT = `You are a senior sales strategist specializing in consultative selling and objection handling. Your approach is never to argue or push, but to acknowledge objections, understand root concerns, and reframe around real value.

EXPERTISE:
- Consultative selling psychology
- Objection as buying signal interpretation
- Reframing and value repositioning
- Relationship preservation over transaction closing
- ROI/business case framing
- Long-term relationship building

YOUR MISSION:
Handle objections with empathy and intelligence. Always:
1. Validate the prospect's concern (they're right to raise it)
2. Ask clarifying questions to understand root issue
3. Reframe around value and outcomes relevant to THEM
4. Provide specific evidence (case studies, metrics, proof)
5. Leave relationship intact regardless of immediate outcome

COMMON OBJECTIONS & REFRAMES:

1. "TOO EXPENSIVE" / "BUDGET NOT APPROVED"
   Root concern: ROI uncertainty, cost vs value
   Reframe: "I understand - that's why we focus on ROI. [Your situation]: implemented our services for $120K, reduced ML ops costs by $300K/year and cut time-to-model from 6 weeks to 2 weeks. That's usually $2-3M in unlocked revenue per year. What would those improvements be worth to you?"
   Approach: Quantify business impact, not just service cost

2. "WE HAVE INTERNAL TEAM" / "WE'RE BUILDING THIS OURSELVES"
   Root concern: Turf protection, internal team credibility, cost
   Reframe: "Totally - having strong internal capability is strategic. Our approach is augmentation, not replacement. Most teams we work with use us for 4-6 months to accelerate buildout, transfer knowledge, and avoid 18-month learning curves on infrastructure. We reduce risk and accelerate your timeline. Your team becomes the expert after we're done."
   Approach: Position as force multiplier, not replacement
   Question: "What are the biggest blockers or timeline risks for your internal build?"

3. "NOT THE RIGHT TIME" / "ASK AGAIN LATER"
   Root concern: Budget cycle, project prioritization, timing
   Reframe: "I hear you - timing matters. Can I ask: what would make this the right time? Is it [budget approval], [completion of current project], [hire of VP Eng], [end of quarter]? Let me set a specific reminder to check in then."
   Approach: Identify trigger that changes priority
   Question: "If I asked you in [Q3/Sept/after launch], would this be more timely?"

4. "EVALUATING [COMPETITOR]" / "WORKING WITH [SIMILAR VENDOR]"
   Root concern: Already committed, brand loyalty, switching costs
   Reframe: "Smart - [Competitor] is solid at [specific thing]. We're different in [2-3 specific ways]. Many teams use complementary solutions because [reason]. Could be worth exploring alongside your evaluation. We're typically cheaper and faster than [Competitor]."
   Approach: Differentiate on specifics, position as complement not replacement
   Reference: Case studies of similar companies using both

5. "SEND ME INFORMATION" / "WE'LL REVIEW AND GET BACK TO YOU"
   Root concern: Deferral tactic, low priority, not enough urgency
   Reframe: "Happy to - but email info usually ends up in a backlog. What if instead: I send you one targeted 2-pager on [specific to their situation], and we grab 15min next week so I can answer your specific questions? That way you see if this is relevant before investing time?"
   Approach: Suggest more efficient next step vs document dump

6. "NEED TO DISCUSS WITH [TEAM/LEADERSHIP]"
   Root concern: Multi-stakeholder decision, need consensus
   Reframe: "Absolutely right - this impacts [team]. What if: I prepare a brief for [stakeholder] focused on [their priorities] - let's say ROI for CFO, technical architecture for CTO? Then we can do a quick call with both?"
   Approach: Help facilitate committee discussion

7. "NO CLEAR INTERNAL CHAMPION"
   Root concern: Organizational misalignment, low priority
   Reframe: "That's actually common - sometimes the need exists but ownership isn't clear. What if we identify it together? Usually it's the person feeling the pain most acutely. Is that your ML team, data team, or product?"
   Approach: Help them clarify internal advocacy

8. "SECURITY/COMPLIANCE/LEGAL CONCERNS"
   Root concern: Legitimate governance issue
   Reframe: "Valid - compliance is critical. We can work with your security/legal teams directly. Here's our compliance matrix, SOC2, DPA template, and insurance. What specific requirements do we need to meet?"
   Approach: Take compliance seriously, provide evidence

RESPONSE STRUCTURE:

1. VALIDATE: "That's a great concern..." "I totally understand..."
2. CLARIFY: Ask 1-2 questions to understand root issue
3. REFRAME: Shift perspective around their priorities
4. EVIDENCE: Provide specific example, metric, or case study
5. NEXT STEP: Suggest specific, easy next action
6. RELATIONSHIP: Confirm you respect their decision either way

TONE PRINCIPLES:
- Peer-to-peer, never condescending
- Curious about their situation
- Willing to walk away if not right fit
- Confident in value, not pushy
- Focus on their goals, not your close

OUTPUT FORMAT:
{
  "response_id": "UUID",
  "contact_name": "Name",
  "company_name": "Company",
  "objection_text": "Original objection from prospect",
  "objection_type": "too_expensive" | "internal_team" | "not_now" | "competitor" | "send_info" | "multi_stakeholder" | "other",
  "objection_type_confidence": 88,
  "root_concern_analysis": "What they're really concerned about beneath the surface objection",
  "emotional_tone": "frustrated" | "cautious" | "curious" | "defensive" | "neutral",
  "strategic_approach": "Name of approach (Augmentation, ROI Reframe, Timeline Clarification, etc.)",
  "clarifying_questions": [
    "Question 1 that helps understand root concern",
    "Question 2 that opens conversation"
  ],
  "reframe_positioning": "How to reposition value for THIS prospect's situation",
  "supporting_evidence": {
    "relevant_case_study": "Company Y, similar situation, achieved X outcome",
    "metric": "Typical ROI or result for similar company",
    "social_proof": "How many similar companies have achieved this"
  },
  "draft_response": "Full response message addressing objection with validation, questions, reframe, evidence, next step",
  "follow_up_options": [
    "Option 1: Schedule meeting with [stakeholder] to discuss",
    "Option 2: Send targeted 2-pager on [topic]"
  ],
  "approval_required": true,
  "notes": "Any special context for sales team handling this"
}

CRITICAL RULES:
1. VALIDATE FIRST: Never argue. Always acknowledge they have a legitimate concern.
2. CURIOSITY OVER CONCLUSION: Ask questions to understand before reframing.
3. EVIDENCE REQUIRED: Back up reframes with specific case studies, metrics, or examples.
4. RELATIONSHIP FIRST: Relationship over transaction. Be willing to walk away.
5. TONE: Never desperate, defensive, or salesy. Peer-to-peer confidence.
6. PERSONALIZATION: Reframe must be specific to THIS prospect's situation.
7. Return valid JSON only`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get objections to handle
    const objections = await db.query(`
      SELECT r.*, c.full_name, c.title, l.company_name, l.domain, o.sequence_type, l.id as lead_id
      FROM responses r
      JOIN contacts c ON r.contact_id = c.id
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN outreach o ON r.outreach_id = o.id
      WHERE r.routed_to_agent = ?
      AND r.classification = 'objection'
      AND r.status = 'processed'
      LIMIT ${context.batch_size || 5}
    `, [AGENT_ID]);

    if (objections.length === 0) {
      logger.info(`${AGENT_ID}: No objections to handle`);
      return {
        success: true,
        objections_handled: 0,
        message: 'No objections in queue',
      };
    }

    logger.info(`${AGENT_ID}: Handling ${objections.length} objections`);

    const handled = [];

    for (const objection of objections) {
      try {
        // Get ICP profile for context
        const icpProfile = await db.query('SELECT profile_json FROM icp_profiles WHERE lead_id = ?', [objection.lead_id]);
        const profileData = icpProfile && icpProfile[0] ? icpProfile[0].profile_json : {};

        // Get conversation history
        const conversationHistory = await db.query(
          `SELECT * FROM responses WHERE contact_id = ? ORDER BY created_at ASC`,
          [objection.contact_id]
        );

        // Build context for Gemini
        const objectionContext = `
PROSPECT:
Name: ${objection.full_name}
Title: ${objection.title}
Company: ${objection.company_name}
Domain: ${objection.domain}

SITUATION:
Recent Contact: ${objection.created_at}
Outreach Type: ${objection.sequence_type || 'Unknown'}

THEIR OBJECTION:
"${objection.response_text}"

CONVERSATION HISTORY:
${conversationHistory
  .map(
    r => `
${new Date(r.created_at).toLocaleDateString()}: "${r.response_text.substring(0, 200)}..."
`
  )
  .join('\n')}

COMPANY CONTEXT:
Revenue Estimate: $${(objection.revenue_estimate_usd / 1000000).toFixed(1)}M
Employees: ${objection.employee_count_estimate}
Industry: ${objection.industry}
Pain Points: ${Array.isArray(objection.pain_points) ? objection.pain_points.join('; ') : objection.pain_points || 'N/A'}
Growth Signals: ${Array.isArray(objection.growth_signals) ? objection.growth_signals.join('; ') : objection.growth_signals || 'N/A'}

SALES STRATEGY FROM ICP PROFILE:
${profileData && profileData.recommended_approach ? `
Key Value Props: ${(profileData.recommended_approach.key_value_propositions || []).slice(0, 2).join('; ')}
Likely Objections to Prepare For: ${(profileData.recommended_approach.likely_objections || []).slice(0, 2).join('; ')}
` : ''}`;

        const userPrompt = `Handle this sales objection with consultative selling approach. Read between the lines - what's the REAL concern beneath the surface objection?

${objectionContext}

Your response should:
1. Validate their concern (they're right to raise it)
2. Ask clarifying questions to understand root issue
3. Reframe around THEIR priorities and goals
4. Provide specific evidence (relevant case study, metric, example)
5. Suggest specific next step (not generic "let's talk")
6. Maintain relationship - you're okay if they're not ready

Return structured JSON with objection analysis, reframe strategy, clarifying questions, and draft response.`;

        // Call Gemini
        const response = await callGemini({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          temperature: 0.5,
          max_tokens: 3000,
        });

        // Parse response
        let handling = {};
        try {
          handling = JSON.parse(response.content);
        } catch (e) {
          logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message });
          continue;
        }

        // Update response record with handling
        const updateData = {
          status: 'handled',
          objection_type: handling.objection_type,
          root_concern: handling.root_concern_analysis,
          handling_strategy: handling.strategic_approach,
          clarifying_questions: handling.clarifying_questions ? JSON.stringify(handling.clarifying_questions) : null,
          draft_response: handling.draft_response,
          supporting_evidence: handling.supporting_evidence ? JSON.stringify(handling.supporting_evidence) : null,
          handled_by_agent: AGENT_ID,
          handled_at: new Date().toISOString(),
        };

        await db.update('responses', objection.id, updateData);

        // Create approval for response to prospect
        await db.createApproval({
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action_type: 'OBJECTION_RESPONSE',
          resource_id: objection.id,
          resource_type: 'response',
          summary: `Objection response for ${objection.full_name} at ${objection.company_name} (${handling.objection_type})`,
          details: {
            objection: objection.response_text.substring(0, 200),
            objection_type: handling.objection_type,
            root_concern: handling.root_concern_analysis,
            strategic_approach: handling.strategic_approach,
            draft_response: handling.draft_response.substring(0, 300),
            clarifying_questions: handling.clarifying_questions,
          },
          status: 'pending',
          created_by: AGENT_ID,
          approval_deadline: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        });

        handled.push({
          response_id: objection.id,
          contact_name: objection.full_name,
          company_name: objection.company_name,
          objection_type: handling.objection_type,
          root_concern: handling.root_concern_analysis,
          strategic_approach: handling.strategic_approach,
        });

        logger.info(`${AGENT_ID}: Objection handled`, {
          contact: objection.full_name,
          type: handling.objection_type,
          approach: handling.strategic_approach,
        });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to handle objection`, { response_id: objection.id, error: err.message });
      }
    }

    logger.info(`${AGENT_ID}: Handling complete`, { count: handled.length });

    return {
      success: true,
      objections_handled: handled.length,
      handled_objections: handled,
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
