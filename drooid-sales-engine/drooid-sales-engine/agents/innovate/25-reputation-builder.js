const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-25';
const AGENT_NAME = 'Reputation Builder';
const SYSTEM_PROMPT = `You are an online reputation and brand monitoring specialist for Drooid. Your mission is to monitor Drooid's online presence, build brand authority, and capitalize on opportunities to amplify positive signals.

Monitoring scope:

1. Direct Mentions:
   - Google Alerts for "Drooid" and key people (founders, CTOs)
   - Where are we mentioned? Positive, neutral, or negative context?
   - Are we being compared to competitors? Which ones? What's the narrative?
   - Are we missing opportunities to join conversations?

2. Review Platforms:
   - G2, Clutch, AppReviews, Capterra, etc.
   - What are reviewers saying? What patterns emerge in feedback?
   - Are we responding to all reviews? Tone and speed of responses?
   - Opportunities to request reviews from happy customers?

3. Social Mentions:
   - Twitter/X: who's talking about Drooid? In what context?
   - LinkedIn: profile mentions, company page mentions, content engagement
   - Reddit, HackerNews, industry forums: are we being discussed?
   - Sentiment: is discussion positive, negative, or neutral?

4. Competitive Mentions:
   - When prospects/analysts discuss our competitors, is Drooid mentioned?
   - Are there misconceptions about our positioning?
   - Which competitors are we most frequently compared to?

5. Industry Conversations:
   - What topics are hot in AI agents, automation, B2B SaaS right now?
   - Are we thought leaders in these conversations, or just observers?
   - Which industry voices should we be building relationships with?

6. Brand Health Metrics:
   - Sentiment score (what % of mentions are positive/neutral/negative)
   - Share of voice (% of industry conversation about Drooid vs competitors)
   - Reach and engagement (how many people are seeing Drooid content)
   - Brand affinity (are people recommending us?)

Actions to take:

1. Responding to Mentions:
   - Reviews: always respond (positive and negative) quickly and professionally
   - Negative mentions: address concerns genuinely, offer solutions
   - Competitive discussions: join thoughtfully (not defensively)
   - Incorrect information: correct politely with evidence

2. Building Thought Leadership:
   - Guest posting opportunities: where should we write?
   - Podcast appearances: who should we approach?
   - Speaking engagements: which conferences, webinars?
   - Expert interviews: should we quote Drooid people in articles?

3. Content Amplification:
   - When we publish great content, who should we share it with?
   - Which industry influencers should see it?
   - How can we get more visibility in relevant communities?

4. Relationship Building:
   - Key opinion leaders: who influences our ICP?
   - Analyst relations: are we visible to Gartner, Forrester, etc.?
   - Industry peers: potential partners, joint ventures, co-marketing?

5. Reputation Defense:
   - If negative information is circulating, what's the truth?
   - How do we address misconceptions?
   - What misinformation should we correct?

Output recommendations should be:
- Specific: "Comment on [this tweet] with [this reply]"
- Actionable: Include exact text for responses/comments
- Timely: Identify time-sensitive opportunities
- Strategic: Connect to Drooid's brand positioning`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      monitor_web = true,
      monitor_social = true,
      monitor_reviews = true,
      generate_opportunities = true,
      focus_area = '',
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      monitor_web,
      monitor_social,
      monitor_reviews,
      generate_opportunities,
      focus_area,
    });

    // 2. Fetch mention data from various sources
    const mentionsQuery = await db.query(
      `SELECT
        source, mentioned_context, sentiment, created_at, url, author
      FROM brand_mentions
      WHERE created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 50`
    );

    const mentions = mentionsQuery.rows || [];

    // Sentiment analysis
    const positiveCount = mentions.filter((m) => m.sentiment === 'positive').length;
    const negativeCount = mentions.filter((m) => m.sentiment === 'negative').length;
    const neutralCount = mentions.filter((m) => m.sentiment === 'neutral').length;
    const totalCount = mentions.length;
    const sentimentScore = totalCount > 0 ? ((positiveCount - negativeCount) / totalCount) * 100 : 0;

    // Source breakdown
    const sourceBreakdown = {};
    mentions.forEach((m) => {
      sourceBreakdown[m.source] = (sourceBreakdown[m.source] || 0) + 1;
    });

    // 2b. Fetch review data
    const reviewsQuery = await db.query(
      `SELECT
        platform, rating, review_text, status, created_at, author
      FROM reviews
      WHERE created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 20`
    );

    const reviews = reviewsQuery.rows || [];

    // 3. Build prompt for Gemini
    const userPrompt = `Analyze Drooid's online reputation and brand presence. Generate actionable recommendations.

MENTION DATA (Last 30 days):
Total Mentions: ${totalCount}
Positive: ${positiveCount} (${((positiveCount / totalCount) * 100).toFixed(1)}%)
Neutral: ${neutralCount} (${((neutralCount / totalCount) * 100).toFixed(1)}%)
Negative: ${negativeCount} (${((negativeCount / totalCount) * 100).toFixed(1)}%)
Sentiment Score: ${sentimentScore.toFixed(0)}/100

Mentions by Source:
${Object.entries(sourceBreakdown)
  .map(([source, count]) => `- ${source}: ${count} mentions`)
  .join('\n')}

Recent Mentions:
${mentions
  .slice(0, 10)
  .map((m) => `[${m.source} - ${m.sentiment.toUpperCase()}] "${m.mentioned_context.substring(0, 100)}..." (${m.author})`)
  .join('\n')}

REVIEW DATA (Last 30 days):
${reviews
  .map(
    (r) =>
      `[${r.platform} - ${r.rating}/5] "${r.review_text.substring(0, 100)}..." by ${r.author} [${r.status}]`
  )
  .join('\n')}

Focus Area: ${focus_area || 'Overall reputation and brand building'}

Provide comprehensive reputation analysis with:

1. Reputation Health Summary
   - Current sentiment score and trend
   - Key themes in mentions (what are people saying?)
   - Competitive positioning (how are we mentioned relative to competitors?)
   - Brand perception by audience segment

2. Mention Analysis
   - Which mentions warrant responses? (specify who should respond)
   - Any misinformation or misconceptions to address?
   - Positive mentions to amplify (retweet, share, thank)
   - Patterns in negative feedback (are there trends?)

3. Review Platform Insights
   - Which review platforms need attention?
   - Unreplied reviews: draft responses
   - Low-rating trends: are there patterns? Root causes?
   - Opportunities to request reviews from happy customers

4. Competitive Mentions
   - How often are we mentioned alongside competitors?
   - What's the competitive narrative?
   - Are there ways to strengthen our positioning?
   - Should we respond to competitor mentions? How?

5. Thought Leadership Opportunities
   - Guest posting opportunities (which publications should we target?)
   - Podcast appearances (which shows fit our ICP?)
   - Speaking engagements (which conferences/events?)
   - Expert network opportunities (where should we be quoted?)

6. Influencer & Relationship Opportunities
   - Key opinion leaders to build relationships with
   - Analysts who cover the space
   - Industry peers for potential partnerships
   - Communities where we should be more active

7. Response Drafts
   - For each significant mention/review needing response:
     - Who should respond (Drooid person)?
     - What's the tone?
     - Draft response text (ready to post)
     - Expected impact

8. 30-Day Action Plan
   - Which mentions/reviews to respond to immediately?
   - New content/thought leadership to create
   - Relationships to build
   - Communities to engage in
   - Metrics to track

Output as JSON:
{
  "reputation_health": {
    "sentiment_score": 0,
    "sentiment_trend": "improving|stable|declining",
    "overall_assessment": "...",
    "key_themes": [...],
    "brand_perception_by_segment": {
      "prospect_decision_makers": "...",
      "existing_customers": "...",
      "industry_analysts": "...",
      "technical_community": "..."
    }
  },
  "mention_analysis": {
    "positive_mentions_to_amplify": [
      { "source": "...", "author": "...", "url": "...", "action": "..." }
    ],
    "negative_mentions_to_address": [
      { "source": "...", "context": "...", "concern": "...", "suggested_response": "..." }
    ],
    "misinformation": [
      { "claim": "...", "truth": "...", "sources_spreading": [...], "response_needed": true }
    ]
  },
  "review_insights": {
    "platforms_needing_attention": [...],
    "unreplied_reviews": [
      { "platform": "...", "rating": 0, "review_text": "...", "response_draft": "..." }
    ],
    "negative_feedback_patterns": [...]
  },
  "competitive_analysis": {
    "competitor_comparison_mentions": [...],
    "positioning_opportunities": [...],
    "response_recommendations": [...]
  },
  "thought_leadership_opportunities": {
    "guest_posting": [
      { "publication": "...", "topic_suggestion": "...", "contact_info": "..." }
    ],
    "podcasts": [
      { "show_name": "...", "host": "...", "audience": "...", "pitch": "..." }
    ],
    "speaking_opportunities": [
      { "event": "...", "date": "...", "audience": "...", "contact_info": "..." }
    ],
    "analyst_relations": [...]
  },
  "relationship_building": {
    "key_influencers": [
      { "name": "...", "role": "...", "reach": "...", "engagement_strategy": "..." }
    ],
    "industry_peers": [
      { "company": "...", "partnership_opportunity": "...", "contact": "..." }
    ],
    "communities": [
      { "name": "...", "activity": "...", "engagement_opportunity": "..." }
    ]
  },
  "action_items": [
    { "action": "...", "priority": "high|medium|low", "owner": "...", "timeline": "..." }
  ],
  "metrics_to_track": {
    "sentiment_score_target": 0,
    "monthly_mentions_target": 0,
    "review_response_rate_target": 0,
    "thought_leadership_pieces_target": 0
  }
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let reputationData;
    try {
      reputationData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!reputationData.reputation_health || !reputationData.action_items) {
      throw new Error('Gemini response missing required reputation data');
    }

    // 5. Store in Supabase
    const reportRecord = await db.query(
      `INSERT INTO reputation_reports (
        sentiment_score, sentiment_trend, report_data, status
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, created_at`,
      [
        reputationData.reputation_health.sentiment_score,
        reputationData.reputation_health.sentiment_trend,
        JSON.stringify({
          reputation_health: reputationData.reputation_health,
          mention_analysis: reputationData.mention_analysis,
          review_insights: reputationData.review_insights,
          competitive_analysis: reputationData.competitive_analysis,
          thought_leadership_opportunities: reputationData.thought_leadership_opportunities,
          relationship_building: reputationData.relationship_building,
          metrics_to_track: reputationData.metrics_to_track,
        }),
        'completed',
      ]
    );

    if (!reportRecord.rows.length) {
      throw new Error('Failed to insert reputation report');
    }

    const reportId = reportRecord.rows[0].id;

    // 6. Create action items for responses
    const responseDrafts = [];

    // Add review responses
    if (reputationData.review_insights.unreplied_reviews) {
      for (const review of reputationData.review_insights.unreplied_reviews.slice(0, 5)) {
        responseDrafts.push({
          type: 'review_response',
          platform: review.platform,
          target_id: review.review_text,
          response_text: review.response_draft,
          priority: review.rating < 3 ? 'high' : 'medium',
          requires_approval: true,
        });
      }
    }

    // Add mention responses
    if (reputationData.mention_analysis.negative_mentions_to_address) {
      for (const mention of reputationData.mention_analysis.negative_mentions_to_address.slice(0, 3)) {
        responseDrafts.push({
          type: 'mention_response',
          source: mention.source,
          concern: mention.concern,
          response_text: mention.suggested_response,
          priority: 'high',
          requires_approval: true,
        });
      }
    }

    // Store response drafts
    for (const draft of responseDrafts) {
      await db.query(
        `INSERT INTO response_drafts (report_id, draft_type, target_info, response_text, requires_approval)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          reportId,
          draft.type,
          JSON.stringify({ platform: draft.platform || draft.source, target: draft.target_id || draft.concern }),
          draft.response_text,
          draft.requires_approval,
        ]
      );
    }

    // 7. Create approval records for high-priority responses
    const highPriorityItems = reputationData.action_items.filter((a) => a.priority === 'high').slice(0, 5);

    for (const item of highPriorityItems) {
      if (item.action.toLowerCase().includes('response') || item.action.toLowerCase().includes('reply')) {
        await db.query(
          `INSERT INTO approvals (report_id, type, status, reviewer_role)
           VALUES ($1, $2, $3, $4)`,
          [reportId, 'reputation_response', 'pending', 'marketing']
        );
      }
    }

    // 8. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      report_id: reportId,
      sentiment_score: reputationData.reputation_health.sentiment_score,
      sentiment_trend: reputationData.reputation_health.sentiment_trend,
      action_items: reputationData.action_items.length,
      response_drafts: responseDrafts.length,
      positive_mentions: reputationData.mention_analysis.positive_mentions_to_amplify?.length || 0,
    });

    return {
      success: true,
      report_id: reportId,
      reputation_health: {
        sentiment_score: reputationData.reputation_health.sentiment_score,
        sentiment_trend: reputationData.reputation_health.sentiment_trend,
        overall_assessment: reputationData.reputation_health.overall_assessment,
      },
      key_themes: reputationData.reputation_health.key_themes,
      action_summary: {
        positive_mentions_to_amplify: reputationData.mention_analysis.positive_mentions_to_amplify?.length || 0,
        negative_mentions_to_address: reputationData.mention_analysis.negative_mentions_to_address?.length || 0,
        unreplied_reviews: reputationData.review_insights.unreplied_reviews?.length || 0,
        response_drafts_created: responseDrafts.length,
      },
      opportunities: {
        guest_posting: reputationData.thought_leadership_opportunities.guest_posting?.length || 0,
        podcasts: reputationData.thought_leadership_opportunities.podcasts?.length || 0,
        speaking: reputationData.thought_leadership_opportunities.speaking_opportunities?.length || 0,
      },
      action_items_count: reputationData.action_items.length,
      metrics_targets: reputationData.metrics_to_track,
      status: 'report_complete',
      message: `Reputation analysis complete with ${reputationData.action_items.length} action items and ${responseDrafts.length} response drafts`,
    };
  } catch (error) {
    await db.logAgentAction(AGENT_ID, 'error', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
