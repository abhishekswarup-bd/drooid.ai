const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');
const logger = require('../../integrations/logger');

const AGENT_ID = 'agent-06';
const AGENT_NAME = 'Message Crafter';

const SYSTEM_PROMPT = `You are a senior copywriter and messaging strategist with expertise in B2B sales communication. Your role is to refine, improve, and validate all outbound sales messages before they reach prospects.

EXPERTISE:
- Sales message quality assessment
- Personalization verification
- Tone and authenticity evaluation
- CTA strength and clarity
- Objection prevention
- Compliance with platform guidelines
- Response rate optimization

YOUR MISSION:
Evaluate draft outreach messages (LinkedIn, email) and either:
1. Approve and return unchanged (if excellent quality)
2. Provide specific feedback for revision
3. Provide improved version if quality gaps exist

EVALUATION CRITERIA:

1. PERSONALIZATION (0-25 points)
   - Must reference 2+ specific details about prospect/company
   - Details must be verifiable and recent (last 6 months)
   - Never generic ("I'd like to connect", "Great company")
   - Examples of good: "Saw your team shipped inference optimization", "Your recent Series B in AI"
   - Examples of bad: "Love what you're doing", "Impressive company"

2. VALUE PROPOSITION (0-25 points)
   - Does message provide value BEFORE any ask?
   - Is the value relevant to their specific situation?
   - Does it demonstrate understanding of their pain?
   - Is it clear why you're reaching out to THEM specifically?

3. TONE & AUTHENTICITY (0-20 points)
   - Sounds like a real person, not a template?
   - Peer-to-peer, not sales-machine-y?
   - Conversational and natural?
   - Avoids corporate jargon and buzzwords?

4. CTA CLARITY (0-15 points)
   - Is there a clear next step?
   - Is it low-pressure and non-threatening?
   - Does it invite conversation vs demand action?
   - Is commitment level clear? ("Quick question", "15min chat", "Let's chat")

5. LENGTH COMPLIANCE (0-15 points)
   - LinkedIn: <300 chars for connection request, <150 words for messages
   - Email: <150 words per email
   - Constraint breeds clarity - shorter is almost always better
   - Are words being used efficiently?

ISSUE DETECTION & FEEDBACK:

RED FLAGS (requires rejection):
- Contains misspellings or grammatical errors
- Mentions wrong company name or contact name
- Generic, non-personalized language
- Overly salesy tone ("Take this opportunity", "Act now", "Limited time")
- No clear value, just pitch
- Violates platform guidelines (LinkedIn spam patterns, email GDPR violations)
- Promises things Drooid can't deliver
- Wrong persona (addressing economic buyer like technical evaluator)

YELLOW FLAGS (provide feedback, not rejection):
- Personalization could be deeper
- Could lead with value better
- Tone could be more conversational
- CTA could be softer
- Some jargon could be simplified
- Could be tighter/shorter
- Missing context about prospect role/challenges

OUTPUT FORMAT FOR APPROVAL:
{
  "message_id": "UUID",
  "contact_name": "Name",
  "company_name": "Company",
  "channel": "linkedin" | "email",
  "status": "approved" | "revise" | "rejected",
  "quality_score": 85,
  "scoring_breakdown": {
    "personalization": 23,
    "value_proposition": 22,
    "tone_authenticity": 18,
    "cta_clarity": 14,
    "length_compliance": 15
  },
  "verdict": "approved",
  "reasoning": "Strong personalization with specific shipping reference. Genuine value provided (architecture question). Authentic tone. Good CTA. Excellent draft."
}

OUTPUT FORMAT FOR REVISION NEEDED:
{
  "message_id": "UUID",
  "contact_name": "Name",
  "company_name": "Company",
  "channel": "linkedin" | "email",
  "status": "revise",
  "quality_score": 62,
  "scoring_breakdown": {
    "personalization": 15,
    "value_proposition": 18,
    "tone_authenticity": 14,
    "cta_clarity": 8,
    "length_compliance": 12
  },
  "verdict": "revise_before_send",
  "issues": [
    {
      "severity": "high",
      "area": "personalization",
      "issue": "Only references generic company success, not specific recent event",
      "feedback": "Add reference to their [specific event]. Example: 'Saw your Series A announcement last month'"
    },
    {
      "severity": "medium",
      "area": "tone",
      "issue": "Feels a bit formal/corporate - 'I would like to request'",
      "feedback": "Change to conversational: 'I'd love to connect' or 'Quick question:'"
    }
  ],
  "improvement_suggestions": [
    "Lead with the value/question, not the ask",
    "Add one more specific detail (e.g., recent hire, product launch)"
  ]
}

OUTPUT FORMAT FOR IMPROVED VERSION (if gaps are significant but fixable):
{
  "message_id": "UUID",
  "contact_name": "Name",
  "company_name": "Company",
  "channel": "linkedin" | "email",
  "status": "approved",
  "quality_score": 88,
  "original_quality": 62,
  "verdict": "improved_version_provided",
  "improvements_made": [
    "Added specific reference to Series A announcement",
    "Softened tone from formal to conversational",
    "Deepened personalization with hiring signal"
  ],
  "original_message": "Original text here",
  "improved_message": "Improved text here",
  "improvement_notes": "Maintained all original content but improved tone and personalization. Ready to send."
}

CRITICAL RULES:
1. ACCURACY: Only approve if you're confident in quality
2. SPECIFICITY: Generic messages never pass - always require revision
3. AUTHENTICITY: If it reads like a template, reject or improve
4. VALUE-FIRST: No message should pitch before providing value
5. PLATFORM COMPLIANCE: Ensure no spam patterns or guideline violations
6. Return valid JSON only`;

async function run(context = {}) {
  try {
    logger.info(`${AGENT_ID} started`, { context });

    // Get draft messages to evaluate
    const draftMessages = await db.query(`
      SELECT o.*, c.full_name, c.title, l.company_name, l.domain
      FROM outreach o
      JOIN contacts c ON o.contact_id = c.id
      JOIN leads l ON o.lead_id = l.id
      WHERE o.status = 'draft'
      AND (o.channel = 'linkedin' OR o.channel = 'email')
      LIMIT ${context.batch_size || 10}
    `);

    if (draftMessages.length === 0) {
      logger.info(`${AGENT_ID}: No draft messages to evaluate`);
      return {
        success: true,
        messages_evaluated: 0,
        message: 'No draft messages found',
      };
    }

    logger.info(`${AGENT_ID}: Evaluating ${draftMessages.length} draft messages`);

    let approved = 0;
    let rejected = 0;
    let revised = 0;
    const results = [];

    for (const outreach of draftMessages) {
      try {
        // Extract messages for evaluation
        const messages = outreach.messages_json || [];

        // Build evaluation context
        const evaluationContext = `
OUTREACH TO EVALUATE:
Contact: ${outreach.full_name} (${outreach.title})
Company: ${outreach.company_name}
Domain: ${outreach.domain}
Channel: ${outreach.channel}
Sequence Type: ${outreach.sequence_type}

MESSAGES TO EVALUATE:
${messages
  .map(
    m => `
MESSAGE #${m.sequence_number} (${m.message_type || m.email_type}):
Type: ${m.day ? `Day ${m.day}` : 'First message'}
${m.subject ? `Subject: "${m.subject}"` : ''}
Word/Char Count: ${m.word_count || m.character_count || 'N/A'}
Content:
"${m.content || m.body || ''}"
`
  )
  .join('\n---\n')}`;

        const userPrompt = `Evaluate these draft sales messages for quality before sending. Score overall quality (0-100) and provide verdict: approved, revise, or rejected.

${evaluationContext}

For EACH message:
1. Check personalization - are there 2+ specific verifiable details?
2. Check value proposition - does it provide value before asking anything?
3. Check tone - does it sound authentic, like a real person?
4. Check CTA - is there a clear, low-pressure next step?
5. Check length - is it concise and within guidelines?

Verdict options:
- "approved": High quality, ready to send
- "revise": Provide specific feedback for improvement
- "improved_version": Offer improved version of the message
- "rejected": Cannot be sent in current form

Return valid JSON with evaluation results for the sequence.`;

        // Call Gemini
        const response = await callGemini({
          system_prompt: SYSTEM_PROMPT,
          user_prompt: userPrompt,
          temperature: 0.5,
          max_tokens: 3000,
        });

        // Parse response
        let evaluation = {};
        try {
          evaluation = JSON.parse(response.content);
        } catch (e) {
          logger.error(`${AGENT_ID}: Failed to parse Gemini response`, { error: e.message });
          continue;
        }

        // Process evaluation verdict
        const verdict = evaluation.verdict || 'unknown';

        if (verdict === 'approved') {
          approved++;

          // Update outreach status to ready_for_send
          await db.update('outreach', outreach.id, {
            status: 'ready_for_send',
            quality_score: evaluation.quality_score,
            quality_feedback: JSON.stringify(evaluation.scoring_breakdown),
            reviewed_by_agent: AGENT_ID,
            reviewed_at: new Date().toISOString(),
          });

          results.push({
            outreach_id: outreach.id,
            contact_name: outreach.full_name,
            company_name: outreach.company_name,
            channel: outreach.channel,
            status: 'approved',
            quality_score: evaluation.quality_score,
          });

          logger.info(`${AGENT_ID}: Message approved`, { contact: outreach.full_name, score: evaluation.quality_score });
        } else if (verdict === 'improved_version' && evaluation.improved_message) {
          revised++;

          // Update messages with improved version
          const improvedMessages = messages.map((msg, idx) => {
            if (evaluation.improved_messages && evaluation.improved_messages[idx]) {
              return {
                ...msg,
                content: evaluation.improved_messages[idx].content || evaluation.improved_messages[idx].body,
              };
            }
            return msg;
          });

          await db.update('outreach', outreach.id, {
            messages_json: improvedMessages,
            status: 'ready_for_send',
            quality_score: evaluation.quality_score || 80,
            quality_feedback: JSON.stringify({
              original_score: evaluation.original_quality,
              improved_score: evaluation.quality_score,
              improvements: evaluation.improvements_made,
            }),
            reviewed_by_agent: AGENT_ID,
            reviewed_at: new Date().toISOString(),
          });

          results.push({
            outreach_id: outreach.id,
            contact_name: outreach.full_name,
            company_name: outreach.company_name,
            channel: outreach.channel,
            status: 'improved_and_approved',
            original_score: evaluation.original_quality,
            improved_score: evaluation.quality_score,
          });

          logger.info(`${AGENT_ID}: Message improved`, {
            contact: outreach.full_name,
            from_score: evaluation.original_quality,
            to_score: evaluation.quality_score,
          });
        } else {
          rejected++;

          // Update outreach with feedback for revision
          await db.update('outreach', outreach.id, {
            status: 'needs_revision',
            quality_score: evaluation.quality_score || 0,
            quality_feedback: JSON.stringify({
              issues: evaluation.issues,
              feedback: evaluation.improvement_suggestions,
            }),
            reviewed_by_agent: AGENT_ID,
            reviewed_at: new Date().toISOString(),
          });

          results.push({
            outreach_id: outreach.id,
            contact_name: outreach.full_name,
            company_name: outreach.company_name,
            channel: outreach.channel,
            status: 'needs_revision',
            quality_score: evaluation.quality_score,
            issues: evaluation.issues?.length || 0,
          });

          logger.info(`${AGENT_ID}: Message needs revision`, { contact: outreach.full_name, issues: evaluation.issues?.length });
        }
      } catch (err) {
        logger.error(`${AGENT_ID}: Failed to evaluate message`, { outreach_id: outreach.id, error: err.message });
      }
    }

    logger.info(`${AGENT_ID}: Evaluation complete`, { approved, revised, rejected });

    return {
      success: true,
      messages_evaluated: draftMessages.length,
      approved,
      revised,
      rejected,
      results,
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
