const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-14';
const AGENT_NAME = 'Competitive Intel';
const SYSTEM_PROMPT = `You are a competitive intelligence analyst specializing in the AI-powered sales automation and intelligent agent space. Your mission is to provide factual, honest, tactical intelligence about competitors that helps the sales team win deals.

When a competitor is mentioned in a deal or during a competitive scan, you gather and organize intelligence on: their core offerings and positioning, pricing models and typical deal sizes, recent wins and losses (when detectable), team changes and leadership strength, technology capabilities and limitations, customer satisfaction signals, and go-to-market strategy.

Your battlecards are honest and fact-based, never disparaging. You acknowledge competitors' genuine strengths while highlighting Drooid's differentiation. The goal isn't to trash-talk — it's to arm the team with credible, tactical knowledge that wins deals through superior understanding.

Key principle: focus on differentiation and win strategy. Every battlecard answers: "Why would a customer choose Drooid over this competitor?" with concrete evidence and talking points. You acknowledge where competitors are strong, then show Drooid's unique value. You highlight weaknesses only where they're relevant to the deal at hand.

You stay current on competitive landscape but never spread unsubstantiated rumors. You distinguish between confirmed facts, reasonable market assessments, and speculation. You update battlecards periodically as competitive landscape shifts.

Return valid JSON:
{
  "competitor_name": "Company Name",
  "battlecard_date": "YYYY-MM-DD",
  "summary": "1-2 sentence positioning",
  "their_strengths": ["strength1", "strength2", "strength3"],
  "their_weaknesses": ["weakness1", "weakness2"],
  "our_differentiators": ["difference1", "difference2", "difference3"],
  "talking_points": [{"point": "specific talking point", "use_when": "context", "evidence": "why credible"}],
  "common_objections_when_competing": [{"objection": "common objection", "reframe": "how to address", "drooid_evidence": "our proof"}],
  "price_comparison": "how their pricing typically compares to ours",
  "win_strategy": "3-4 sentence approach to winning deals when competing",
  "recent_news": "Any recent significant moves",
  "sources": ["source1", "source2"],
  "confidence_level": 0.8,
  "last_updated": "YYYY-MM-DD"
}`;

async function run(context = {}) {
  const startTime = Date.now();
  let action_id;

  try {
    const { competitor_name, deal_id, lead_id, force_refresh = false } = context;

    if (!competitor_name) {
      throw new Error('competitor_name required in context');
    }

    // Log action start
    action_id = await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'competitive_intel_start',
      context: { competitor_name, deal_context: !!deal_id }
    });

    // 1. Check if we already have recent battlecard for this competitor
    const { data: existingCards } = await db
      .from('content')
      .select('*')
      .eq('type', 'competitive_intel')
      .ilike('title', `%${competitor_name}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    const existingCard = existingCards?.[0];
    const cardAgeInDays = existingCard
      ? Math.floor((Date.now() - new Date(existingCard.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Use existing card if less than 30 days old and not forced refresh
    if (existingCard && cardAgeInDays < 30 && !force_refresh) {
      try {
        const existingData = JSON.parse(existingCard.body);
        await db.logAgentAction({
          agent_id: AGENT_ID,
          agent_name: AGENT_NAME,
          action: 'competitive_intel_cached',
          parent_action_id: action_id,
          context: { competitor: competitor_name, card_age_days: cardAgeInDays }
        });

        return {
          success: true,
          agent_id: AGENT_ID,
          battlecard: existingData,
          source: 'cached',
          card_age_days: cardAgeInDays,
          duration_ms: Date.now() - startTime
        };
      } catch (parseError) {
        console.warn('Existing card parse error, regenerating');
      }
    }

    // 2. Fetch context if deal_id provided
    let dealContext = '';
    if (deal_id) {
      const { data: deal } = await db
        .from('pipeline')
        .select('*, leads(company_name, industry)')
        .eq('id', deal_id)
        .single();

      if (deal) {
        dealContext = `
DEAL CONTEXT:
- Prospect: ${deal.leads?.company_name}
- Industry: ${deal.leads?.industry}
- Deal Notes: ${deal.notes?.substring(0, 300) || 'No notes'}
- Stage: ${deal.stage}`;
      }
    }

    // 3. Build intelligence gathering prompt
    const intelPrompt = `Research and create a competitive battlecard for: ${competitor_name}

This is an AI-powered sales automation and intelligent agents competitor.

${dealContext}

RESEARCH REQUIREMENTS:
1. What is their core offering and positioning?
2. What are their genuine strengths? (Be honest)
3. What are their limitations or weaknesses relative to Drooid?
4. How do they typically price? Deal size range?
5. What's their go-to-market approach?
6. Any recent news, wins, or leadership changes?
7. Customer satisfaction signals (reviews, feedback)?
8. Where does Drooid differentiate from them?

BATTLECARD PURPOSE:
This is for our sales team to win deals. Be factual, not disparaging. Acknowledge their strengths, highlight our differentiation. The goal is winning through superior knowledge and product fit.

TALKING POINTS:
Create 3-4 specific talking points for when we're directly competing. Each should have context (when to use) and evidence (why credible).

COMMON OBJECTIONS:
When prospects mention them as alternative, what are they likely saying? How do we reframe?

OUTPUT TONE:
- Confident but not arrogant
- Factual, never speculative
- Focused on customer outcomes not features
- Honest about tradeoffs

Return valid JSON as specified. Cite sources where possible. Be specific.`;

    // 4. Call Gemini for competitive research
    const geminiResponse = await callGemini({
      system: SYSTEM_PROMPT,
      prompt: intelPrompt,
      temperature: 0.3,
      timeout: 35000
    });

    if (!geminiResponse?.content) {
      throw new Error('No response from Gemini');
    }

    // 5. Parse JSON output
    let battlecard = {};
    try {
      const jsonMatch = geminiResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }
      battlecard = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.warn('Battlecard parse error:', parseError.message);
      // Create basic structure from response
      battlecard = {
        competitor_name,
        battlecard_date: new Date().toISOString().split('T')[0],
        summary: geminiResponse.content.substring(0, 200),
        their_strengths: ['Market presence', 'Integration capabilities'],
        their_weaknesses: ['Limited customization'],
        our_differentiators: ['Custom agent workflows', 'Superior outcomes'],
        talking_points: [],
        common_objections_when_competing: [],
        win_strategy: 'Focus on custom capabilities and customer outcomes',
        confidence_level: 0.6,
        sources: ['market_knowledge']
      };
    }

    // Ensure required fields
    battlecard.competitor_name = battlecard.competitor_name || competitor_name;
    battlecard.battlecard_date = battlecard.battlecard_date || new Date().toISOString().split('T')[0];
    battlecard.last_updated = new Date().toISOString().split('T')[0];
    battlecard.confidence_level = battlecard.confidence_level || 0.7;

    // 6. Store battlecard as content
    const { data: contentRecord, error: contentError } = await db
      .from('content')
      .insert({
        type: 'competitive_intel',
        title: `Battlecard: ${competitor_name}`,
        body: JSON.stringify(battlecard, null, 2),
        created_by: AGENT_ID,
        metadata: {
          competitor_name,
          confidence: battlecard.confidence_level,
          talking_points_count: (battlecard.talking_points || []).length
        }
      });

    if (contentError) {
      console.warn(`Content storage warning: ${contentError.message}`);
    }

    // 7. If this is deal-specific, link the battlecard to the deal
    if (deal_id && contentRecord) {
      const { error: linkError } = await db
        .from('deal_competitive_intel')
        .insert({
          pipeline_id: deal_id,
          competitor_name,
          battlecard_id: contentRecord[0].id,
          created_at: new Date().toISOString()
        });

      if (linkError) {
        console.warn(`Deal link warning: ${linkError.message}`);
      }
    }

    // 8. Log completion
    await db.logAgentAction({
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: 'competitive_intel_complete',
      parent_action_id: action_id,
      duration_ms: Date.now() - startTime,
      result_summary: {
        competitor: competitor_name,
        talking_points: (battlecard.talking_points || []).length,
        confidence: battlecard.confidence_level,
        content_id: contentRecord?.[0]?.id
      }
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      battlecard,
      source: 'generated',
      stored_as_content: !!contentRecord,
      duration_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`Agent ${AGENT_ID} error:`, error.message);

    if (action_id) {
      await db.logAgentAction({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'competitive_intel_failed',
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
