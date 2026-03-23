const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-21';
const AGENT_NAME = 'SEO Optimizer';
const SYSTEM_PROMPT = `You are a technical SEO specialist for drooid.org, a B2B AI services website targeting CTOs, VPs of Engineering, and technical founders. Your job is to audit existing content for SEO performance and recommend specific, actionable improvements.

Core responsibility: Help Drooid rank for high-intent keywords in the AI agent, sales automation, and digital transformation space.

SEO audit dimensions:

1. Keyword Optimization:
   - Does the page target a clear primary keyword?
   - Are secondary/related keywords naturally incorporated?
   - Is keyword density appropriate (not over-optimized)?
   - Are long-tail variations included?
   - Target keywords: "AI agents", "sales automation", "AI implementation", "autonomous sales", "B2B AI solutions", "agent-based software"

2. Title Tag & Meta Description:
   - Is the title 50-60 characters, keyword-optimized, compelling?
   - Does the title clearly convey the article's value?
   - Is the meta description 155-160 characters?
   - Does the meta description include the primary keyword?
   - Would the meta description attract clicks from search results?

3. Header Structure:
   - Is there exactly one H1 on the page (the title)?
   - Do H2/H3 headers follow logical hierarchy?
   - Are headers keyword-rich but natural-sounding?
   - Could any headers be improved to signal topic relevance?

4. Content Quality:
   - Is the content comprehensive for the target keyword?
   - Are claims backed by data/sources?
   - Is the content fresh and up-to-date?
   - Does it answer the "search intent" (informational, commercial, transactional)?
   - Are there enough internal links to related content?

5. Technical SEO:
   - Is the page mobile-friendly?
   - Are images optimized with descriptive alt text?
   - Is the page speed acceptable?
   - Are structured data (schema markup) present?
   - Is the URL slug SEO-friendly?

6. Internal Linking:
   - Are there 3+ relevant internal links to other Drooid content?
   - Do anchor texts use natural, keyword-rich language?
   - Are linked pages logically related?
   - Is there a content pillar/cluster structure?

7. Content Gaps:
   - What related keywords is Drooid NOT ranking for?
   - What topics do competitors rank for that Drooid doesn't?
   - What questions do prospects ask that no Drooid article answers?
   - What content updates would improve rankings?

Output recommendations should be:
- Specific: "Update H2 'AI Implementation' to 'AI Agent Implementation Best Practices' (includes secondary keyword)"
- Actionable: "Add 2-3 sentences about ROI metrics in the Implementation section (addresses common search query)"
- Prioritized: High-impact quick wins first, then strategic improvements
- Data-driven: Reference current rankings, search volume, or metrics when available`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const {
      content_id = null,
      analyze_all = false,
      google_search_console_data = {},
    } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      content_id,
      analyze_all,
    });

    // 2. Fetch content to audit
    let contentQuery;
    if (content_id) {
      contentQuery = await db.query(
        `SELECT id, title, body, meta_description, seo_keywords, slug, canonical_url, published_at
         FROM content
         WHERE id = $1 AND published_at IS NOT NULL`,
        [content_id]
      );
    } else if (analyze_all) {
      contentQuery = await db.query(
        `SELECT id, title, body, meta_description, seo_keywords, slug, canonical_url, published_at
         FROM content
         WHERE published_at IS NOT NULL
         ORDER BY published_at DESC
         LIMIT 10`
      );
    } else {
      // Default: analyze last 5 published posts
      contentQuery = await db.query(
        `SELECT id, title, body, meta_description, seo_keywords, slug, canonical_url, published_at
         FROM content
         WHERE published_at IS NOT NULL
         ORDER BY published_at DESC
         LIMIT 5`
      );
    }

    if (!contentQuery.rows.length) {
      return {
        success: true,
        message: 'No published content to analyze',
        audits: [],
      };
    }

    const auditResults = [];

    for (const content of contentQuery.rows) {
      try {
        // 3. Build prompt for Gemini
        const userPrompt = `Perform a detailed SEO audit for this drooid.org article:

URL: ${content.canonical_url || 'https://drooid.org/' + content.slug}
Title: ${content.title}
Meta Description: ${content.meta_description}
SEO Keywords: ${JSON.parse(content.seo_keywords).join(', ')}

Content:
${content.body.substring(0, 5000)}
${content.body.length > 5000 ? '... [truncated]' : ''}

Google Search Console Metrics (last 90 days):
${Object.entries(google_search_console_data).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Provide a comprehensive SEO audit with these sections:

1. Current Performance: estimated current rankings, search volume for primary keyword
2. Title & Meta Analysis: specific feedback on current title/description
3. Header Structure Review: feedback on H1-H3 hierarchy
4. Keyword Optimization: which keywords are well-optimized, which need work
5. Content Quality Assessment: gaps, depth issues, data/sources
6. Internal Linking Audit: current links, suggestions for new internal links
7. Technical SEO Checklist: mobile, images, speed, schema, URL
8. Content Gap Analysis: what related topics/keywords are missing
9. Competitor Comparison: what similar articles from competitors rank better for
10. Improvement Priority: quick wins, medium-term improvements, strategic initiatives

Output as JSON:
{
  "content_id": "${content.id}",
  "url": "...",
  "current_seo_score": 0-100,
  "estimated_current_rank": "...",
  "search_volume_target_keyword": 0,
  "title_analysis": {
    "current": "...",
    "recommendation": "...",
    "reason": "..."
  },
  "meta_description_analysis": {
    "current": "...",
    "recommendation": "...",
    "reason": "..."
  },
  "header_structure": {
    "current_assessment": "...",
    "issues": [...],
    "recommendations": [...]
  },
  "keyword_optimization": {
    "well_optimized": [...],
    "needs_work": [...],
    "missing_opportunities": [...]
  },
  "content_quality": {
    "strengths": [...],
    "gaps": [...],
    "improvements": [...]
  },
  "internal_links": {
    "current_count": 0,
    "suggested_new_links": [{ "anchor_text": "...", "target_url": "/" }]
  },
  "technical_seo": {
    "mobile_friendly": true,
    "image_optimization": "...",
    "schema_markup_status": "...",
    "url_slug_quality": "..."
  },
  "content_gaps": {
    "missing_keywords": [...],
    "topic_gaps": [...]
  },
  "competitor_insights": [
    { "keyword": "...", "competitor": "...", "gap": "..." }
  ],
  "improvement_roadmap": {
    "quick_wins": [{ "action": "...", "impact": "...", "effort": "..." }],
    "medium_term": [{ "action": "...", "impact": "...", "effort": "..." }],
    "strategic": [{ "action": "...", "impact": "...", "effort": "..." }]
  }
}`;

        // 4. Call Gemini
        const response = await callGemini(userPrompt, SYSTEM_PROMPT);

        let auditData;
        try {
          auditData = JSON.parse(response);
        } catch (parseErr) {
          throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
        }

        // 5. Store audit in database
        const auditRecord = await db.query(
          `INSERT INTO content_audits (content_id, audit_type, seo_score, audit_data, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at`,
          [
            content.id,
            'seo_comprehensive',
            auditData.current_seo_score,
            JSON.stringify(auditData),
            'completed',
          ]
        );

        if (!auditRecord.rows.length) {
          throw new Error('Failed to insert audit record');
        }

        // 6. Store recommendations in content table for tracking
        const improvements = [
          ...auditData.improvement_roadmap.quick_wins,
          ...auditData.improvement_roadmap.medium_term,
          ...auditData.improvement_roadmap.strategic,
        ];

        if (improvements.length > 0) {
          await db.query(
            `INSERT INTO content (
              type, title, body, parent_content_id, status, requires_approval
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              'seo_audit',
              `SEO Audit: ${content.title}`,
              JSON.stringify(improvements),
              content.id,
              'analysis',
              false,
            ]
          );
        }

        // 7. Log success
        await db.logAgentAction(AGENT_ID, 'audit_completed', {
          content_id: content.id,
          audit_id: auditRecord.rows[0].id,
          seo_score: auditData.current_seo_score,
          quick_wins: auditData.improvement_roadmap.quick_wins.length,
        });

        auditResults.push({
          content_id: content.id,
          url: content.canonical_url,
          title: content.title,
          audit_id: auditRecord.rows[0].id,
          seo_score: auditData.current_seo_score,
          quick_wins_count: auditData.improvement_roadmap.quick_wins.length,
          medium_term_count: auditData.improvement_roadmap.medium_term.length,
          strategic_count: auditData.improvement_roadmap.strategic.length,
          status: 'audit_complete',
        });
      } catch (contentError) {
        await db.logAgentAction(AGENT_ID, 'error', {
          content_id: content.id,
          error: contentError.message,
        });

        auditResults.push({
          content_id: content.id,
          title: content.title,
          status: 'error',
          error: contentError.message,
        });
      }
    }

    return {
      success: true,
      audits_completed: auditResults.filter((r) => r.status === 'audit_complete').length,
      failed_audits: auditResults.filter((r) => r.status === 'error').length,
      results: auditResults,
      message: `Completed ${auditResults.filter((r) => r.status === 'audit_complete').length} SEO audits`,
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
