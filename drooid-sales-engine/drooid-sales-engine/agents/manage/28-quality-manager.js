const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-28';
const AGENT_NAME = 'Quality Manager';
const SYSTEM_PROMPT = `You are the Chief Quality Officer for the Drooid Sales Engine's outbound communications.

Your role:
- Review every outreach message, email, LinkedIn post, proposal, and blog post before CEO approval
- Act as the quality gate between agent creation and human approval
- Enforce these quality criteria:
  1. Personalization depth: must reference 2+ specific details about prospect/company
  2. Value proposition: every message must offer or imply value, never just ask
  3. Brand voice: confident, technical, peer-to-peer, never salesy or desperate
  4. Accuracy: no hallucinated facts about the prospect
  5. Length compliance: LinkedIn under 300 chars for connection, emails under 150 words
  6. CTA appropriateness: soft and natural, not pushy

Scoring:
- Score each piece 1-10
- Reject anything below 7 with specific improvement feedback sent back to originating agent
- Approve 7+ for CEO review

You process every outbound touch. Your decisions directly impact brand reputation and response rates.`;

async function run(context = {}) {
  const startTime = Date.now();
  const runId = `${AGENT_ID}-${Date.now()}`;

  try {
    // Fetch all draft outreach records pending approval
    const { data: draftItems, error: fetchError } = await db
      .from('outreach')
      .select('*')
      .eq('status', 'draft')
      .eq('approved', false)
      .order('created_at', { ascending: true });

    if (fetchError) throw new Error(`Failed to fetch draft items: ${fetchError.message}`);

    const itemsToReview = draftItems || [];

    if (itemsToReview.length === 0) {
      // No items to review
      await logAgentRun(runId, 'success', {
        items_reviewed: 0,
        summary: 'No draft items pending review'
      });

      return {
        success: true,
        agent_id: AGENT_ID,
        run_id: runId,
        reviewed_items: [],
        approved: [],
        rejected_with_feedback: [],
        quality_scores: {},
        trends: {},
        execution_time_ms: Date.now() - startTime
      };
    }

    // Process each item through quality review
    const approved = [];
    const rejectedWithFeedback = [];
    const qualityScores = {};
    const reviewResults = [];

    for (const item of itemsToReview) {
      try {
        const reviewResult = await reviewItem(item);
        reviewResults.push(reviewResult);

        qualityScores[item.id] = reviewResult.score;

        if (reviewResult.approved) {
          approved.push({
            id: item.id,
            outreach_id: item.id,
            channel: item.channel,
            score: reviewResult.score,
            reviewer: AGENT_ID,
            reviewed_at: new Date().toISOString()
          });

          // Update outreach record
          await db
            .from('outreach')
            .update({
              status: 'quality_approved',
              approved: false, // Waiting for CEO approval
              quality_score: reviewResult.score,
              quality_review_at: new Date().toISOString(),
              quality_reviewer: AGENT_ID
            })
            .eq('id', item.id);

        } else {
          rejectedWithFeedback.push({
            id: item.id,
            outreach_id: item.id,
            channel: item.channel,
            score: reviewResult.score,
            feedback: reviewResult.feedback,
            originating_agent: item.agent_id,
            reviewed_at: new Date().toISOString()
          });

          // Update outreach record with revision needed status
          await db
            .from('outreach')
            .update({
              status: 'revision_needed',
              quality_score: reviewResult.score,
              quality_feedback: reviewResult.feedback,
              quality_review_at: new Date().toISOString(),
              quality_reviewer: AGENT_ID
            })
            .eq('id', item.id);

          // Create approval record for rejection
          await db
            .from('approvals')
            .insert({
              type: 'quality_revision',
              item_id: item.id,
              agent_id: item.agent_id,
              status: 'pending',
              content: {
                original_content: item.content,
                rejection_reason: reviewResult.feedback,
                score: reviewResult.score,
                criteria_failed: reviewResult.criteria_failed
              },
              created_at: new Date().toISOString()
            });
        }
      } catch (itemError) {
        console.error(`Error reviewing item ${item.id}:`, itemError);
        // Continue processing other items
      }
    }

    // Calculate quality trends
    const scores = Object.values(qualityScores);
    const trends = {
      average_score: scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0,
      approval_rate: approved.length > 0
        ? (approved.length / (approved.length + rejectedWithFeedback.length) * 100).toFixed(2) + '%'
        : '0%',
      approved_count: approved.length,
      revision_needed_count: rejectedWithFeedback.length,
      items_reviewed: itemsToReview.length
    };

    // Store metrics
    await db
      .from('agent_metrics')
      .insert({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        run_id: runId,
        metrics: {
          reviewed_items: itemsToReview.length,
          approved: approved.length,
          rejected: rejectedWithFeedback.length,
          average_quality_score: trends.average_score,
          approval_rate: trends.approval_rate
        },
        execution_time_ms: Date.now() - startTime,
        tokens_used: 0,
        api_calls: itemsToReview.length + 2,
        status: 'success',
        created_at: new Date().toISOString()
      });

    await logAgentRun(runId, 'success', trends);

    return {
      success: true,
      agent_id: AGENT_ID,
      run_id: runId,
      reviewed_items: itemsToReview.length,
      approved,
      rejected_with_feedback: rejectedWithFeedback,
      quality_scores: qualityScores,
      trends,
      execution_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('Quality Manager error:', error);

    await logAgentRun(runId, 'error', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      agent_id: AGENT_ID,
      run_id: runId,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    };
  }
}

async function reviewItem(item) {
  const reviewPrompt = `
Review this outreach content for quality against Drooid's standards:

Channel: ${item.channel || 'unknown'}
Content Type: ${item.content_type || 'message'}
Prospect: ${item.prospect_name || 'Unknown'}
Company: ${item.company_name || 'Unknown'}

Content:
${item.content}

Evaluate against these criteria:
1. Personalization depth (1-10): Does it reference 2+ specific details about prospect/company?
2. Value proposition (1-10): Does it offer/imply value, not just ask?
3. Brand voice (1-10): Is it confident, technical, peer-to-peer (not salesy)?
4. Accuracy (1-10): Are facts about prospect/company correct and verifiable?
5. Length compliance (1-10): Within appropriate limits for channel?
6. CTA appropriateness (1-10): Is the call-to-action soft and natural?

Respond with ONLY a valid JSON object:
{
  "score": 0-10,
  "approved": true/false,
  "personalization": 0-10,
  "value_proposition": 0-10,
  "brand_voice": 0-10,
  "accuracy": 0-10,
  "length_compliance": 0-10,
  "cta_appropriateness": 0-10,
  "criteria_failed": ["criterion1", "criterion2"],
  "feedback": "specific improvement suggestions if rejected",
  "reasoning": "brief explanation of score"
}`;

  const reviewContent = await callGemini(
    reviewPrompt,
    SYSTEM_PROMPT,
    { temperature: 0.2, maxTokens: 800 }
  );

  let reviewResult;
  try {
    const jsonMatch = reviewContent.match(/\{[\s\S]*\}/);
    reviewResult = JSON.parse(jsonMatch ? jsonMatch[0] : reviewContent);
  } catch (parseError) {
    console.error('Failed to parse review response:', parseError);
    reviewResult = {
      score: 5,
      approved: false,
      feedback: 'Unable to parse review criteria. Manual review required.',
      criteria_failed: ['parsing_error'],
      reasoning: 'Review system error'
    };
  }

  // Ensure approved status matches score threshold
  if (!reviewResult.approved && reviewResult.score < 7) {
    reviewResult.approved = false;
  } else if (reviewResult.score >= 7) {
    reviewResult.approved = true;
  }

  return reviewResult;
}

async function logAgentRun(runId, status, details) {
  try {
    await db
      .from('agent_logs')
      .insert({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        run_id: runId,
        status,
        details,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log agent run:', error);
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
