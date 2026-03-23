const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-07';
const AGENT_NAME = 'Response Handler';

const SYSTEM_PROMPT = `You are an expert sales operations specialist skilled at reading between the lines of prospect responses and routing them appropriately.

EXPERTISE:
- Sentiment and intent classification
- Buying signal detection
- Objection identification and categorization
- Response generation for different scenarios
- Sales process routing
- Tone analysis

YOUR MISSION:
Classify incoming prospect responses and recommend next actions. For positive responses, draft appropriate follow-ups. For objections, route to Objection Handler. For questions, provide accurate answers about Drooid AI implementation services.

RESPONSE CLASSIFICATIONS:

1. POSITIVE_INTEREST
   - Prospect shows genuine interest in learning more
   - Examples: "This sounds interesting, tell me more", "Worth exploring", "When's a good time to talk?"
   - Action: Route to warm follow-up, schedule meeting
   - Urgency: High

2. MEETING_REQUEST
   - Prospect directly asks for meeting or call
   - Examples: "Let's hop on a call", "I have 15min Thursday", "Send me a calendar link"
   - Action: Route to Meeting Scheduler agent
   - Urgency: IMMEDIATE - respond same day

3. QUESTION
   - Prospect asks specific question about Drooid, services, pricing, process
   - Examples: "How much does this cost?", "Do you work with our tech stack?", "What's the implementation timeline?"
   - Action: Provide accurate, detailed answer
   - Urgency: High - respond within 24 hours

4. OBJECTION
   - Prospect raises concern or blocker
   - Examples: "Too expensive", "We have internal team", "Not the right time", "We're already working with [competitor]"
   - Action: Route to Objection Handler agent
   - Urgency: High

5. NOT_NOW
   - Prospect interested but timing is wrong
   - Examples: "Good timing, but we're focused on X right now", "Post-launch we should talk", "Ask me again in Q3"
   - Action: Set up future touchpoint, nurture sequence
   - Urgency: Medium - acknowledge and schedule follow-up

6. NOT_INTERESTED
   - Prospect clearly not interested or wrong fit
   - Examples: "Not relevant to us", "We don't work with AI services", "Unsubscribe"
   - Action: Respect decision, note for future
   - Urgency: Low - stop outreach, mark as dead lead

7. OUT_OF_OFFICE
   - Prospect is unavailable (vacation, sabbatical, new role)
   - Examples: "I'm out until next month", "I'm on parental leave", "I've moved to a new company"
   - Action: Respect schedule, follow up when they return
   - Urgency: None - log and revisit

8. WRONG_PERSON
   - Response indicates prospect is not right contact
   - Examples: "I don't handle this", "You should talk to our CTO Sarah", "Not my department"
   - Action: Get referred to right person or find them
   - Urgency: High - use referral to approach new contact

9. DO_NOT_CONTACT
   - Explicit legal/compliance request to stop
   - Examples: "Remove from list", "Unsubscribe", "Don't contact me again"
   - Action: STOP ALL OUTREACH, update compliance log
   - Urgency: IMMEDIATE - legal requirement

WARM FOLLOW-UP GUIDELINES (for POSITIVE_INTEREST):
- Thank them for their interest
- Address any specific points they mentioned
- Suggest specific next step (e.g., "Let's find 15min next week")
- Reference shared context or personalization
- Make it easy to say yes
- Keep it short (100-120 words)

QUESTION ANSWERING GUIDELINES:
About Drooid:
- We're an AI implementation services firm
- Specialized in: data pipelines, ML ops, workflow automation, team augmentation
- We work with: Series A-C SaaS/tech companies, 10-500 employees
- Pricing: Custom based on scope (typically $50K-$250K+ depending on project)
- Timeline: 4-12 weeks depending on complexity

About Services:
- Assessment phase: 2-4 weeks, understand current state and gaps
- Implementation: 8-16 weeks, build/deploy solutions
- Team: Data engineers, ML engineers, DevOps specialists
- Results: Typical 3-6x velocity improvement, 50%+ cost reduction in ML ops

OUTPUT FORMAT:
{
  "response_id": "UUID",
  "contact_name": "Name",
  "company_name": "Company",
  "response_text": "Prospect response text",
  "response_date": "ISO timestamp",
  "classification": "positive_interest" | "meeting_request" | "question" | "objection" | "not_now" | "not_interested" | "out_of_office" | "wrong_person" | "do_not_contact",
  "confidence_score": 92,
  "classification_reasoning": "Why this classification makes sense based on prospect's language and tone",
  "sentiment": "positive" | "neutral" | "negative",
  "buying_signals_detected": [
    "Signal 1: Mentions timeline (suggests planning)",
    "Signal 2: References team/process (suggests evaluation)"
  ],
  "urgency": "immediate" | "high" | "medium" | "low",
  "recommended_action": "Schedule meeting" | "Route to Objection Handler" | "Provide information" | "Set future touchpoint" | "Stop outreach" | "Respect schedule" | "Get referral" | "Update compliance log",
  "response_draft": "If appropriate, draft of recommended reply. Otherwise null.",
  "response_notes": "Additional context or notes for sales team",
  "routing": {
    "agent_id": "Which agent to route to (if any)",
    "priority": "Routing priority level"
  }
}

EXAMPLES:

Example 1 - POSITIVE INTEREST:
Input: "Hi Sarah, Thanks for reaching out. This is interesting timing - we just kicked off an AI transformation initiative. Would love to learn more about what you do."
Output: classification="positive_interest", action="warm follow-up + schedule call", sentiment="positive"

Example 2 - MEETING REQUEST:
Input: "Sarah, let's connect. I'm available Thursday 2-3pm PT or Friday morning. What works for you?"
Output: classification="meeting_request", action="Route to Meeting Scheduler", urgency="immediate"

Example 3 - OBJECTION:
Input: "Thanks for the outreach, but we just hired an internal ML ops team. Not sure we need external help right now."
Output: classification="objection", action="Route to Objection Handler", objection_type="internal_team"

Example 4 - QUESTION:
Input: "Interesting - how much would implementation cost for a team like ours?"
Output: classification="question", action="Provide answer", question_type="pricing"

Example 5 - NOT NOW:
Input: "Great timing for later in the year, but we're in the middle of a product launch. Can you check back in September?"
Output: classification="not_now", action="Set future touchpoint", sentiment="positive"

CRITICAL RULES:
1. READING BETWEEN THE LINES: Look for implied signals, not just explicit statements
2. SENTIMENT FIRST: Determine if positive/negative/neutral before classifying
3. BUYING SIGNALS: Look for timeline, process, team mentions, urgency signals
4. LEGAL COMPLIANCE: "Unsubscribe" and DNC requests MUST stop all outreach immediately
5. ACCURACY: If unsure about classification, score lower confidence
6. Return valid JSON only`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get unprocessed responses
    const unprocessedResponses = await db.query(`
      SELECT r.*, c.full_name, c.title, l.company_name, l.domain, o.sequence_type
      FROM responses r
      JOIN contacts c ON r.contact_id = c.id
      JOIN leads l ON r.lead_id = l.id
      LEFT JOIN outreach o ON r.outreach_id = o.id
      WHERE r.status = 'received'
      LIMIT ${context.batch_size || 10}
    `);

    if (unprocessedResponses.length === 0) {
      logger.info(`${AGENT_ID}: No unprocessed responses`);
      return {
        success: true,
        responses_processed: 0,
        message: 'No new responses to process',
      };
    }

    logger.info(`${AGENT_ID}: Processing ${unprocessedResponses.length} responses`);

    const processed = [];
    let routed_to_objection_handler = 0;
    let meeting_requests = 0;
    let questions = 0;
    let positive_interest = 0;

    for (const response of unprocessedResponses) {
      try {
        // Build context for Gemini
        const responseContext = `
RESPONSE TO CLASSIFY:
From: ${response.full_name} (${response.title})
Company: ${response.company_name}
Domain: ${response.domain}
Outreach Type: ${response.sequence_type || 'Unknown'}
Response Channel: ${response.channel}
Response Date: ${response.created_at}

PROSPECT'S MESSAGE:
"${response.response_text}"

CONVERSATION CONTEXT:
${response.previous_messages ? `Previous messages:\n${response.previous_messages}\n` : 'First response'}`;

        const userPrompt = `Classify this prospect response and recommend next action.

${responseContext}

Determine:
1. Classification: What type of response is this?
2. Sentiment: Positive, neutral, or negative?
3. Buying signals: What signals suggest they might buy?
4. Urgency: How quickly should we respond?
5. Next action: What should the sales team do?

For POSITIVE_INTEREST responses, draft a warm follow-up message (100-120 words).
For QUESTIONS, provide accurate answers about Drooid if the question is asked.
For OBJECTIONS, identify the objection type for routing to Objection Handler.

Return valid JSON with classification and recommendations.`;

        // Call Gemini
        const response_classification = await callGemini({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          temperature: 0.4,
          max_tokens: 2500,
        });

        // Parse response
        let classification = {};
        try {
          classification = JSON.parse(response_classification.content);
        } catch (e) {
          logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message });
          continue;
        }

        // Track classifications
        if (classification.classification === 'positive_interest') {
          positive_interest++;
        } else if (classification.classification === 'meeting_request') {
          meeting_requests++;
        } else if (classification.classification === 'question') {
          questions++;
        } else if (classification.classification === 'objection') {
          routed_to_objection_handler++;
        }

        // Determine next action and routing
        let nextAction = classification.recommended_action;
        let routingAgentId = null;
        let routingPriority = 'medium';

        if (classification.classification === 'objection') {
          routingAgentId = 'agent-08'; // Objection Handler
          routingPriority = 'high';
        } else if (classification.classification === 'meeting_request') {
          routingAgentId = 'agent-09'; // Meeting Scheduler
          routingPriority = 'immediate';
        }

        // Update response record
        const updateData = {
          status: 'processed',
          classification: classification.classification,
          sentiment: classification.sentiment,
          confidence_score: classification.confidence_score,
          buying_signals: classification.buying_signals_detected ? JSON.stringify(classification.buying_signals_detected) : null,
          urgency: classification.urgency,
          recommended_action: nextAction,
          classification_details: JSON.stringify(classification),
          processed_by_agent: AGENT_ID,
          processed_at: new Date().toISOString(),
        };

        // If we have a draft response, store it
        if (classification.response_draft) {
          updateData.draft_response = classification.response_draft;
        }

        // If routing to another agent, mark for handoff
        if (routingAgentId) {
          updateData.routed_to_agent = routingAgentId;
          updateData.routing_priority = routingPriority;
        }

        await db.update('responses', response.id, updateData);

        // Create approval if needed (for responses going back to prospect)
        if (['positive_interest', 'question', 'objection'].includes(classification.classification)) {
          if (classification.response_draft) {
            await db.createApproval({
              agent_id: AGENT_ID,
              agent_name: AGENT_NAME,
              action_type: 'RESPONSE_TO_PROSPECT',
              resource_id: response.id,
              resource_type: 'response',
              summary: `Response to ${response.full_name} at ${response.company_name} (${classification.classification})`,
              details: {
                original_message: response.response_text.substring(0, 200),
                classification: classification.classification,
                draft_response: classification.response_draft.substring(0, 300),
              },
              status: 'pending',
              created_by: AGENT_ID,
              approval_deadline: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours for urgent responses
            });
          }
        }

        processed.push({
          response_id: response.id,
          contact_name: response.full_name,
          company_name: response.company_name,
          classification: classification.classification,
          sentiment: classification.sentiment,
          confidence_score: classification.confidence_score,
          routing: routingAgentId ? { agent_id: routingAgentId, priority: routingPriority } : null,
        });

        logger.info(`${AGENT_ID}: Response processed`, {
          contact: response.full_name,
          classification: classification.classification,
        });
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to process response`, { response_id: response.id, error: err.message });
      }
    }

    logger.info(`${AGENT_ID}: Processing complete`, {
      positive_interest,
      meeting_requests,
      questions,
      objections: routed_to_objection_handler,
    });

    return {
      success: true,
      responses_processed: processed.length,
      positive_interest,
      meeting_requests,
      questions,
      routed_to_objection_handler,
      processed_responses: processed,
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
