/**
 * CEO Agent Abi (#0) - C-Level Executive Outreach Module
 *
 * Agent Identity: Abi Swarup - CEO & Founder | Drooid.org
 * Purpose: Send personalized CEO-to-CEO outreach messages to C-level executives
 *
 * Features:
 * - Targets CxO-level leads (CEO, CTO, CRO, VP Sales, etc.)
 * - 3-stage coaching & QA review pipeline (Draft → Coaching → Final QA)
 * - Gemini API for intelligent message personalization
 * - Supabase integration for leads, outreach, approvals, and logging
 * - Rate limiting: max 5 CxO messages per day
 * - Multiple outreach channels: LinkedIn, Email, Warm Intro Requests
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// Initialize APIs
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Agent Configuration
const AGENT = {
  id: 0,
  name: 'Abi Swarup',
  title: 'CEO & Founder | Drooid.org',
  email: 'abi@drooid.org',
  channel: 'ceo_outreach',
};

// Constants
const QUALIFYING_LEVELS = ['C-Suite', 'VP', 'Director'];
const DAILY_LIMIT = 5;
const QUALITY_THRESHOLD = 7;
const CHANNELS = ['linkedin', 'email', 'warm_intro'];

// Message templates for CEO-to-CEO outreach
const MESSAGE_TEMPLATES = {
  initial_outreach: `Subject: Strategic Partnership Opportunity - [COMPANY]

Hi [FIRST_NAME],

I was impressed by [COMPANY_RECENT_ACHIEVEMENT]. It aligns perfectly with what we're seeing across enterprise sales organizations.

At Drooid, we help revenue teams close deals 3x faster by automating the non-selling work. Given [COMPANY]'s position in [INDUSTRY], I think we could create significant value together.

Would you be open to a brief 15-minute call next week to explore this?

Best,
Abi`,

  follow_up: `Hi [FIRST_NAME],

I came across [INDUSTRY_INSIGHT] and thought of you immediately. This is exactly the challenge I'm seeing with [COMPANY]'s peers.

We've developed a solution that helps teams like yours reclaim 8+ hours per seller per week. Happy to show you the mechanics if you're curious.

Let me know if you'd like to grab 15 minutes next week.

Best,
Abi`,

  warm_intro_request: `Hi [INTRODUCER_NAME],

I'm reaching out to [PROSPECT_NAME] at [COMPANY] regarding a strategic opportunity in [CONTEXT]. I think we could create real value for their revenue team.

Would you be comfortable introducing us? I can send you a short note to forward along.

Thanks,
Abi`,

  event_invite: `Hi [FIRST_NAME],

You've been personally invited to our Executive Roundtable: [EVENT_TITLE]

We're bringing together [COUNT] CMOs and revenue leaders to discuss [TOPIC]. Given your leadership at [COMPANY], I thought you'd be a perfect fit.

Spots are limited. Interested?

[RSVP_LINK]

Best,
Abi`,
};

/**
 * Main Orchestration Function
 * Fetches qualified leads and processes them through the coaching pipeline
 */
async function run(options = {}) {
  console.log(`[${AGENT.name}] Starting CEO outreach agent...`);
  const { dryRun = false, limit = 5 } = options;

  try {
    // Step 1: Check daily rate limit
    const sentToday = await checkDailyLimit();
    if (sentToday >= DAILY_LIMIT) {
      console.log(`[${AGENT.name}] Daily limit (${DAILY_LIMIT}) reached. Pausing.`);
      return { status: 'rate_limited', sent: sentToday };
    }

    const availableSlots = DAILY_LIMIT - sentToday;
    const batchSize = Math.min(limit, availableSlots);

    // Step 2: Fetch qualified C-level leads
    const leads = await fetchQualifiedLeads(batchSize);
    if (leads.length === 0) {
      console.log(`[${AGENT.name}] No qualified leads found.`);
      return { status: 'no_leads', processed: 0 };
    }

    console.log(`[${AGENT.name}] Found ${leads.length} qualified leads to process.`);

    // Step 3: Process each lead through coaching pipeline
    const results = [];
    for (const lead of leads) {
      try {
        const result = await processLead(lead, dryRun);
        results.push(result);
      } catch (error) {
        console.error(`[${AGENT.name}] Error processing lead ${lead.id}:`, error.message);
        results.push({ lead_id: lead.id, status: 'error', error: error.message });
      }
    }

    // Step 4: Log results
    const summary = {
      processed: results.length,
      approved: results.filter(r => r.status === 'approved').length,
      coaching_required: results.filter(r => r.status === 'coaching_required').length,
      failed: results.filter(r => r.status === 'error').length,
      dryRun,
    };

    console.log(`[${AGENT.name}] Batch complete:`, summary);
    return { status: 'success', ...summary, results };
  } catch (error) {
    console.error(`[${AGENT.name}] Fatal error:`, error.message);
    throw error;
  }
}

/**
 * Process a single lead through the 3-stage coaching pipeline
 */
async function processLead(lead, dryRun = false) {
  console.log(`\n[${AGENT.name}] Processing lead: ${lead.prospect_name} @ ${lead.company_name}`);

  try {
    // Stage 1: Draft the message
    console.log(`  → Stage 1: Drafting message...`);
    const draftMessage = await draftMessage(lead);

    if (!draftMessage) {
      throw new Error('Failed to generate draft message');
    }

    // Stage 2: Coaching review
    console.log(`  → Stage 2: Coaching review...`);
    const coachingResult = await conductCoachingReview(draftMessage, lead);

    if (coachingResult.revision_needed) {
      console.log(`  → Revising based on coaching feedback...`);
      const revisedMessage = await reviseMessage(draftMessage, coachingResult.feedback, lead);
      coachingResult.improved_message = revisedMessage;
    }

    // Stage 3: Final QA scoring
    console.log(`  → Stage 3: QA scoring...`);
    const finalMessage = coachingResult.improved_message || draftMessage;
    const qaScore = await conductQAReview(finalMessage, lead);

    console.log(`  → QA Score: ${qaScore.overall_score}/10`);
    console.log(`     - Authenticity: ${qaScore.scores.authenticity}`);
    console.log(`     - Strategic Alignment: ${qaScore.scores.strategic_alignment}`);
    console.log(`     - Personalization: ${qaScore.scores.personalization}`);
    console.log(`     - CTA Clarity: ${qaScore.scores.cta_clarity}`);

    // Step 4: Determine next action
    let status;
    if (qaScore.overall_score >= QUALITY_THRESHOLD) {
      // Message passes QA - send to approval queue
      console.log(`  ✓ Message approved for CEO review (score: ${qaScore.overall_score})`);
      status = 'approved';

      if (!dryRun) {
        await createApprovalRequest(lead, finalMessage, qaScore);
      }
    } else {
      // Message fails QA - redraft and retry
      console.log(`  ⚠ Message below quality threshold. Redrafting...`);
      status = 'coaching_required';
      const redraftMessage = await draftMessage(lead, { forceRework: true });
      const redraftQA = await conductQAReview(redraftMessage, lead);

      if (redraftQA.overall_score >= QUALITY_THRESHOLD) {
        console.log(`  ✓ Redraft approved (score: ${redraftQA.overall_score})`);
        status = 'approved';
        if (!dryRun) {
          await createApprovalRequest(lead, redraftMessage, redraftQA);
        }
      }
    }

    // Step 5: Log to agent_logs
    if (!dryRun) {
      await logActivity({
        agent_id: AGENT.id,
        lead_id: lead.id,
        action: 'outreach_drafted',
        status,
        qa_score: qaScore.overall_score,
        metadata: {
          message_length: finalMessage.length,
          coaching_feedback: coachingResult.feedback,
          qa_details: qaScore.scores,
        },
      });
    }

    return {
      lead_id: lead.id,
      prospect_name: lead.prospect_name,
      status,
      qa_score: qaScore.overall_score,
      message: finalMessage,
    };
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return {
      lead_id: lead.id,
      prospect_name: lead.prospect_name,
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Stage 1: Draft the initial message using Gemini
 */
async function draftMessage(lead, options = {}) {
  const { forceRework = false } = options;

  const prompt = `You are Abi Swarup, CEO and Founder of Drooid.org. Write a CEO-to-CEO outreach message to ${lead.prospect_name}, ${lead.prospect_title} at ${lead.company_name}.

Context:
- Prospect Company: ${lead.company_name}
- Industry: ${lead.industry}
- Company Size: ${lead.company_size}
- Recent Achievement: ${lead.recent_achievement || 'Not provided'}
- Pain Point: ${lead.pain_point || 'Not provided'}
- Decision Level: ${lead.decision_maker_level}

Requirements:
- Tone: Peer-to-peer, strategic, not salesy
- Length: 80-120 words
- Include ONE specific reference to their company or industry
- Clear, specific call-to-action (15-min call)
- Professional yet personable
- Sign off as "Abi"

${forceRework ? 'Focus on fresh angles, different value proposition, stronger personalization.' : ''}

Generate ONLY the message body (no subject line, no metadata).`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error drafting message:', error.message);
    return null;
  }
}

/**
 * Stage 2: Coaching Review - Gemini evaluates and suggests improvements
 */
async function conductCoachingReview(message, lead) {
  const prompt = `You are an expert executive communication coach. Review this CEO-to-CEO outreach message for tone, personalization quality, strategic value, and effectiveness.

Message:
"""
${message}
"""

Context:
- Target: ${lead.prospect_name}, ${lead.prospect_title}
- Company: ${lead.company_name}
- Industry: ${lead.industry}

Evaluate:
1. Tone - Does it sound peer-to-peer and CEO-level?
2. Personalization - Is it specific enough to this prospect?
3. Strategic Value - Does it articulate clear value?
4. Urgency/CTA - Is the call-to-action compelling?

Respond ONLY with JSON:
{
  "revision_needed": boolean,
  "feedback": "specific coaching feedback",
  "strengths": ["list", "of", "strengths"],
  "gaps": ["list", "of", "areas to improve"]
}`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in coaching response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error in coaching review:', error.message);
    return {
      revision_needed: false,
      feedback: 'Coaching review skipped due to error',
      strengths: [],
      gaps: [],
    };
  }
}

/**
 * Revise message based on coaching feedback
 */
async function reviseMessage(originalMessage, coachingFeedback, lead) {
  const prompt = `You are revising a CEO-to-CEO outreach message based on coaching feedback.

Original Message:
"""
${originalMessage}
"""

Coaching Feedback:
${coachingFeedback}

Target: ${lead.prospect_name} at ${lead.company_name}
Industry: ${lead.industry}

Revise the message to address the coaching feedback while maintaining professionalism and Abi's voice. Keep it 80-120 words.

Generate ONLY the revised message body.`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error revising message:', error.message);
    return originalMessage; // Fall back to original
  }
}

/**
 * Stage 3: Final QA Scoring (1-10)
 */
async function conductQAReview(message, lead) {
  const prompt = `Score this CEO-to-CEO outreach message on a scale of 1-10 for each dimension.

Message:
"""
${message}
"""

Target: ${lead.prospect_name}, ${lead.prospect_title} @ ${lead.company_name}

Score each dimension (1-10):
1. Authenticity - Does it sound genuine and CEO-level?
2. Strategic Alignment - Does it align with their business?
3. Personalization Depth - How specific/personalized is it?
4. CTA Clarity - Is the call-to-action clear and compelling?

Respond ONLY with JSON:
{
  "scores": {
    "authenticity": number,
    "strategic_alignment": number,
    "personalization": number,
    "cta_clarity": number
  },
  "overall_score": number,
  "rationale": "brief explanation"
}`;

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in QA response');

    const parsed = JSON.parse(jsonMatch[0]);
    // Calculate overall_score if not provided
    if (!parsed.overall_score) {
      const scores = Object.values(parsed.scores);
      parsed.overall_score = Math.round(scores.reduce((a, b) => a + b) / scores.length);
    }

    return parsed;
  } catch (error) {
    console.error('Error in QA review:', error.message);
    return {
      scores: {
        authenticity: 5,
        strategic_alignment: 5,
        personalization: 5,
        cta_clarity: 5,
      },
      overall_score: 5,
      rationale: 'QA review error',
    };
  }
}

/**
 * Create approval request in Supabase
 */
async function createApprovalRequest(lead, message, qaScore) {
  try {
    const { data, error } = await supabase.from('approvals').insert([
      {
        agent_id: AGENT.id,
        approval_type: 'ceo_outreach',
        lead_id: lead.id,
        prospect_name: lead.prospect_name,
        company_name: lead.company_name,
        content: message,
        qa_score: qaScore.overall_score,
        status: 'pending',
        metadata: {
          qa_details: qaScore.scores,
          decision_maker_level: lead.decision_maker_level,
          channel: lead.preferred_channel || 'email',
        },
        created_at: new Date(),
        created_by: AGENT.id,
      },
    ]);

    if (error) throw error;
    console.log(`  → Approval request created (ID: ${data[0].id})`);
    return data[0];
  } catch (error) {
    console.error('Error creating approval request:', error.message);
    throw error;
  }
}

/**
 * Fetch qualified C-level leads from Supabase
 */
async function fetchQualifiedLeads(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .in('decision_maker_level', QUALIFYING_LEVELS)
      .eq('qualified', true)
      .eq('outreach_status', null) // Not yet contacted
      .limit(limit)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching leads:', error.message);
    return [];
  }
}

/**
 * Check daily outreach limit
 */
async function checkDailyLimit() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('outreach')
      .select('id')
      .eq('agent_id', AGENT.id)
      .gte('sent_at', `${today}T00:00:00`)
      .lt('sent_at', `${today}T23:59:59`);

    if (error) throw error;
    return data ? data.length : 0;
  } catch (error) {
    console.error('Error checking daily limit:', error.message);
    return 0;
  }
}

/**
 * Log activity to agent_logs table
 */
async function logActivity(logEntry) {
  try {
    const { error } = await supabase.from('agent_logs').insert([
      {
        ...logEntry,
        agent_name: AGENT.name,
        timestamp: new Date(),
      },
    ]);

    if (error) throw error;
  } catch (error) {
    console.error('Error logging activity:', error.message);
  }
}

/**
 * Dry run mode - test the pipeline without saving to database
 */
async function dryRun() {
  console.log('\n[DRY RUN] Testing CEO Outreach Pipeline\n');

  // Mock lead
  const mockLead = {
    id: 'test_001',
    prospect_name: 'Sarah',
    prospect_title: 'VP of Sales',
    company_name: 'TechCorp Inc',
    industry: 'Enterprise SaaS',
    company_size: '500-1000',
    decision_maker_level: 'VP',
    recent_achievement: 'Launched new product line last month',
    pain_point: 'Sales team struggling with deal velocity',
    preferred_channel: 'linkedin',
  };

  console.log('Mock Lead:', JSON.stringify(mockLead, null, 2));
  console.log('\n--- Starting Pipeline ---\n');

  // Stage 1: Draft
  console.log('[1] Drafting message...');
  const draftMsg = await draftMessage(mockLead);
  console.log(`Draft (${draftMsg.length} chars):\n${draftMsg}\n`);

  // Stage 2: Coaching
  console.log('[2] Coaching review...');
  const coaching = await conductCoachingReview(draftMsg, mockLead);
  console.log('Coaching Result:', JSON.stringify(coaching, null, 2), '\n');

  // Revise if needed
  let finalMsg = draftMsg;
  if (coaching.revision_needed) {
    console.log('[2b] Revising message...');
    finalMsg = await reviseMessage(draftMsg, coaching.feedback, mockLead);
    console.log(`Revised (${finalMsg.length} chars):\n${finalMsg}\n`);
  }

  // Stage 3: QA
  console.log('[3] Final QA scoring...');
  const qa = await conductQAReview(finalMsg, mockLead);
  console.log('QA Result:', JSON.stringify(qa, null, 2), '\n');

  // Summary
  const decision = qa.overall_score >= QUALITY_THRESHOLD ? 'APPROVED' : 'NEEDS REWORK';
  console.log(`\n✓ Pipeline Complete: ${decision} (Score: ${qa.overall_score}/10)`);

  return {
    status: 'dry_run_success',
    lead: mockLead,
    draft: draftMsg,
    coaching,
    final_message: finalMsg,
    qa_score: qa.overall_score,
    decision,
  };
}

// Export functions
module.exports = {
  run,
  processLead,
  draftMessage,
  conductCoachingReview,
  conductQAReview,
  dryRun,
  AGENT,
  QUALIFYING_LEVELS,
  DAILY_LIMIT,
};

// CLI execution
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'dry-run') {
    dryRun().catch(console.error);
  } else if (command === 'run') {
    const limit = parseInt(process.argv[3]) || 5;
    run({ limit }).catch(console.error);
  } else {
    console.log(`
Usage:
  node index.js dry-run              # Test pipeline with mock data
  node index.js run [limit]          # Run agent (default limit: 5)
    `);
  }
}
