const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-18';
const AGENT_NAME = 'Thought Leadership Creator';
const SYSTEM_PROMPT = `You are an expert content strategist and writer for Drooid.org — an AI implementation studio specializing in autonomous sales agents and digital transformation. Your mission is to create authoritative, insightful articles about AI agents, automation, and business transformation for senior B2B decision-makers (CTOs, VPs of Engineering, CEOs of $1M-$50M technology companies).

Your writing style balances technical credibility with accessibility. You are opinionated (backed by evidence), practical with real examples, and never resort to generic "AI is the future" platitudes. Every article must teach something actionable that your readers can immediately apply.

Content guidelines:
- Target length: 1,200-2,000 words
- Structure: compelling headline + meta description + 3-5 sections with H2 headers + conclusion with clear CTA
- SEO optimization: naturally incorporate primary and secondary keywords, use compelling meta descriptions (155-160 chars), create descriptive headers with keyword placement
- Include 2-3 internal linking opportunities to other Drooid content
- Use real examples: case studies, industry benchmarks, specific metrics
- Tone: confident, direct, technically deep, outcome-focused. You're writing as a peer, not selling
- Never use hype language. Be specific: "reduces customer acquisition cost by 34%" not "dramatically improves"

Brand voice markers:
- Lead with insight, back with data
- Challenge conventional wisdom when warranted
- Address real pain points and implementation challenges, not just benefits
- Include a practical takeaway section

Before writing, analyze: what is the reader's current problem? What misconception might they have? What outcome do they want? Design the article to answer these directly.`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      trending_topics = [],
      prospect_pain_points = [],
      seo_keywords = [],
      article_angle = '',
      author_name = 'Drooid Team',
    } = context;

    if (!trending_topics.length && !article_angle) {
      throw new Error('Must provide either trending_topics or article_angle');
    }

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      topics: trending_topics,
      pain_points: prospect_pain_points,
      keywords: seo_keywords,
    });

    // 2. Build prompt for Gemini
    const userPrompt = `Create a high-impact blog post for Drooid.org with these inputs:

Article Angle: ${article_angle || trending_topics.join(', ')}

Key Pain Points to Address:
${prospect_pain_points.map((p) => `- ${p}`).join('\n')}

Target SEO Keywords (incorporate naturally):
${seo_keywords.map((k) => `- ${k}`).join('\n')}

Requirements:
1. Create a compelling, specific headline (avoid clickbait)
2. Write a meta description (150-160 characters) optimized for search
3. Structure with 3-5 major sections using H2 headers
4. Include 2-3 specific examples or case studies
5. Add a "Key Takeaways" section with 3-4 actionable points
6. End with a strong CTA directing readers to Drooid's services
7. Total word count: 1,200-2,000 words
8. Use markdown formatting with proper headers

Output as JSON:
{
  "headline": "...",
  "meta_description": "...",
  "seo_keywords": [...],
  "body": "# Headline\\n\\n## Section 1\\n...",
  "key_takeaways": [{ "title": "...", "description": "..." }],
  "internal_links": [{ "anchor_text": "...", "url": "/..." }],
  "cta": "...",
  "word_count": 0,
  "reading_time_minutes": 0
}`;

    // 3. Call Gemini
    const response = await callGemini(userPrompt, SYSTEM_PROMPT);

    // 4. Parse output
    let articleData;
    try {
      articleData = JSON.parse(response);
    } catch (parseErr) {
      throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
    }

    // Validate required fields
    if (!articleData.headline || !articleData.body || !articleData.meta_description) {
      throw new Error('Gemini response missing required fields');
    }

    // 5. Store in Supabase
    const contentRecord = await db.query(
      `INSERT INTO content (type, title, body, meta_description, seo_keywords, author, status, requires_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        'blog',
        articleData.headline,
        articleData.body,
        articleData.meta_description,
        JSON.stringify(articleData.seo_keywords),
        author_name,
        'draft',
        true,
      ]
    );

    if (!contentRecord.rows.length) {
      throw new Error('Failed to insert content record');
    }

    const contentId = contentRecord.rows[0].id;

    // 6. Create approval record
    const approvalRecord = await db.query(
      `INSERT INTO approvals (content_id, type, status, reviewer_role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [contentId, 'content_publish', 'pending', 'ceo']
    );

    // 7. Log success
    await db.logAgentAction(AGENT_ID, 'completed', {
      content_id: contentId,
      approval_id: approvalRecord.rows[0].id,
      headline: articleData.headline,
      word_count: articleData.word_count,
    });

    return {
      success: true,
      content_id: contentId,
      approval_id: approvalRecord.rows[0].id,
      headline: articleData.headline,
      word_count: articleData.word_count,
      reading_time: articleData.reading_time_minutes,
      status: 'draft_pending_review',
      message: 'Article created and queued for CEO approval',
      article_preview: {
        headline: articleData.headline,
        meta_description: articleData.meta_description,
        cta: articleData.cta,
      },
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
