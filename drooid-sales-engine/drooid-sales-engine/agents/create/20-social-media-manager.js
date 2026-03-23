const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-20';
const AGENT_NAME = 'Social Media Manager';
const SYSTEM_PROMPT = `You are a B2B social media strategist focused on LinkedIn and Twitter/X for a technical audience. Your mission is to build Drooid's thought leadership and drive qualified engagement across platforms.

Platform strategies:

LinkedIn:
- Audience: CTOs, VPs Engineering, Technical Founders, AI/ML practitioners
- Post types: original insights, industry commentary, behind-the-scenes AI development, client success stories (anonymized), technical deep-dives, industry news reactions
- Tone: professional but personable, conversational, expert
- Length: 150-300 words for maximum reach
- Format: Hook in first line (question, bold statement, or surprising fact), story or insight in body, clear takeaway
- Frequency: 5 posts per week
- Engagement tactics: ask for opinions, share contrarian takes, pose discussion questions
- Hashtags: max 3 relevant hashtags, research-backed choices (not spam)
- Best posting times: Tuesday-Thursday, 7-9 AM or 12-1 PM user timezone

Twitter/X:
- Audience: same technical decision-makers plus developers, engineers, startup founders
- Post types: hot takes on industry news, technical insights, quick tips, industry commentary, retweet/quote with commentary
- Tone: punchy, witty, authoritative
- Length: under 280 characters (save room for engagement)
- Threads: use for longer-form breakdowns (5-7 tweets max)
- Frequency: 7 tweets per week
- Engagement: reply to relevant tweets, build conversation, don't just broadcast
- Hashtags: max 2, only #AI or #Automation when relevant
- Best posting times: 6-9 AM, 12-2 PM, 5-7 PM

Cross-platform rules:
- Never share the same content verbatim on both platforms (different audiences, different formats)
- Never use canned/generic corporate speak
- Always link to broader context (your blog, industry reports, relevant research)
- Create content that stands on its own (don't always link to your own stuff)
- Respond to comments within 24 hours
- Track what resonates: questions > statements, contrarian > consensus, specific > vague

Content themes for this week/month:
1. AI agent implementation challenges (practical, not theoretical)
2. ROI of automation (with real numbers)
3. Industry trends and what they actually mean for builders
4. Common mistakes we see clients make
5. Your engineering process and tooling
6. Commentary on competitor announcements
7. Customer wins (always anonymized, focus on business outcome not technology)
8. Hiring/team building in AI space
9. Market insights from sales conversations
10. Technical innovations in the AI space

Never:
- Post generic "AI is transforming business" content
- Use "game-changer" or "disruptive" unironically
- Share competitor content without unique take
- Post content not backed by data or experience
- Engage in unproductive arguments or flame wars
- Use excessive emojis
- Share anything before fact-checking industry claims`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      source_content_id = null,
      industry_news = [],
      engagement_data = {},
      theme = '',
      batch_generate = false,
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      source_content_id,
      batch_generate,
      theme,
    });

    // 2. Fetch source content or engagement context
    let sourceContent = null;
    if (source_content_id) {
      const contentQuery = await db.query(
        `SELECT id, title, body, canonical_url, slug FROM content
         WHERE id = $1 AND published_at IS NOT NULL`,
        [source_content_id]
      );
      if (contentQuery.rows.length) {
        sourceContent = contentQuery.rows[0];
      }
    }

    // Get recent engagement metrics for trend analysis
    const engagementQuery = await db.query(
      `SELECT platform, content_type, avg_engagement_rate, post_count
       FROM engagement_metrics
       WHERE created_at > NOW() - INTERVAL '30 days'
       ORDER BY avg_engagement_rate DESC
       LIMIT 10`
    );

    const recentPerformance = engagementQuery.rows || [];

    // 3. Build prompt for Gemini
    const userPrompt = `Generate social media content for Drooid's LinkedIn and Twitter/X presence.

${sourceContent ? `Source Content: "${sourceContent.title}" (${sourceContent.canonical_url})` : ''}

Theme/Topic: ${theme}

Industry News/Context:
${industry_news.map((n) => `- ${n}`).join('\n')}

Recent Engagement Trends (what performed well):
${recentPerformance.map((p) => `- ${p.platform}: ${p.content_type} (${(p.avg_engagement_rate * 100).toFixed(1)}% engagement)`).join('\n')}

Requirements:

LinkedIn Posts (create 3):
- 150-300 words each
- Hook in first line
- Original insight or commentary (not just sharing)
- Include discussion question at end
- Max 3 hashtags (choose strategically)
- Specify best posting time (day and hour)

Twitter/X Posts (create 4):
- Under 280 characters each
- Punchy, specific, data-driven when possible
- Mix of hot takes, insights, questions
- Max 2 hashtags (only if essential)
- Specify best posting time

Output as JSON:
{
  "linkedin_posts": [
    {
      "content": "...",
      "hook": "...",
      "discussion_question": "...",
      "hashtags": [...],
      "word_count": 0,
      "suggested_posting_time": "...",
      "expected_performance": "high|medium|low"
    }
  ],
  "twitter_posts": [
    {
      "content": "...",
      "character_count": 0,
      "is_thread": false,
      "hashtags": [...],
      "suggested_posting_time": "...",
      "expected_performance": "high|medium|low"
    }
  ],
  "posting_schedule": "...",
  "engagement_notes": "..."
}`;

    // 4. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    let socialData;
    try {
      socialData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!socialData.linkedin_posts || !socialData.twitter_posts) {
      throw new Error('Gemini response missing required post data');
    }

    // 5. Store in Supabase
    const postResults = [];

    // Store LinkedIn posts
    for (const post of socialData.linkedin_posts) {
      const contentRecord = await db.query(
        `INSERT INTO content (type, title, body, platform, status, requires_approval)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [
          'social',
          `LinkedIn - ${theme || 'Thought Leadership'}`,
          post.content,
          'linkedin',
          'draft',
          true,
        ]
      );

      if (contentRecord.rows.length) {
        const contentId = contentRecord.rows[0].id;

        // Store metadata
        await db.query(
          `INSERT INTO social_post_metadata (content_id, platform, word_count, suggested_posting_time, engagement_expectation)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            contentId,
            'linkedin',
            post.word_count,
            post.suggested_posting_time,
            post.expected_performance,
          ]
        );

        // Create approval record
        const approvalRecord = await db.query(
          `INSERT INTO approvals (content_id, type, status, reviewer_role)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [contentId, 'social_post', 'pending', 'marketing']
        );

        postResults.push({
          content_id: contentId,
          approval_id: approvalRecord.rows[0].id,
          platform: 'linkedin',
          status: 'pending_approval',
          preview: post.content.substring(0, 100) + '...',
        });
      }
    }

    // Store Twitter/X posts
    for (const post of socialData.twitter_posts) {
      const contentRecord = await db.query(
        `INSERT INTO content (type, title, body, platform, status, requires_approval)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [
          'social',
          `Twitter - ${theme || 'Commentary'}`,
          post.content,
          'twitter',
          'draft',
          true,
        ]
      );

      if (contentRecord.rows.length) {
        const contentId = contentRecord.rows[0].id;

        // Store metadata
        await db.query(
          `INSERT INTO social_post_metadata (content_id, platform, character_count, suggested_posting_time, engagement_expectation)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            contentId,
            'twitter',
            post.character_count,
            post.suggested_posting_time,
            post.expected_performance,
          ]
        );

        // Create approval record
        const approvalRecord = await db.query(
          `INSERT INTO approvals (content_id, type, status, reviewer_role)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [contentId, 'social_post', 'pending', 'marketing']
        );

        postResults.push({
          content_id: contentId,
          approval_id: approvalRecord.rows[0].id,
          platform: 'twitter',
          status: 'pending_approval',
          preview: post.content.substring(0, 100) + '...',
        });
      }
    }

    // 6. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      posts_created: postResults.length,
      linkedin_posts: socialData.linkedin_posts.length,
      twitter_posts: socialData.twitter_posts.length,
      theme,
    });

    return {
      success: true,
      posts_created: postResults.length,
      linkedin_posts_count: socialData.linkedin_posts.length,
      twitter_posts_count: socialData.twitter_posts.length,
      posting_schedule: socialData.posting_schedule,
      engagement_notes: socialData.engagement_notes,
      posts: postResults,
      status: 'posts_created_pending_approval',
      message: `Created ${postResults.length} social posts ready for review`,
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
