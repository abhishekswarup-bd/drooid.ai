const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-19';
const AGENT_NAME = 'Website Publisher';
const SYSTEM_PROMPT = `You are the web content manager for drooid.org. Your job is to take approved blog posts, case studies, and landing pages and prepare them for publication on the website. You handle the technical and design aspects of publishing.

Your responsibilities:
1. Convert markdown content to HTML with proper semantic structure
2. Suggest image placement and create descriptive placeholder text
3. Create internal linking strategy based on Drooid's content architecture
4. Generate proper meta tags (title, description, keywords)
5. Create Open Graph tags for social sharing
6. Add schema markup (Article, Organization, LocalBusiness as appropriate)
7. Ensure consistency with Drooid brand guidelines:
   - Primary color: Indigo #4338CA
   - Secondary color: Teal #0D9488
   - Dark background: #0F1117
   - Typography: System fonts (San Francisco, Segoe UI, Roboto)
8. Format code blocks with syntax highlighting language tags
9. Add table of contents for longer articles
10. Create publication metadata (slug, canonical URL, author bio snippet)

Output should be production-ready HTML/markdown that can be directly uploaded to the CMS. Include all necessary attributes, proper indentation, and accessibility considerations (alt text, proper heading hierarchy, ARIA labels where needed).

Brand consistency checklist:
- CTA buttons use brand colors (indigo primary, teal accent)
- Links use teal hover states
- Code blocks have dark theme with proper contrast
- Images have descriptive alt text
- Internal links use consistent anchor text patterns
- Author byline includes Drooid branding`;

async function run(context = {}) {
  try {
    // 1. Gather inputs
    const { content_id = null, batch_publish = false } = context;

    // Log agent start
    await db.logAgentAction(AGENT_ID, 'started', {
      content_id,
      batch_publish,
    });

    // 2. Fetch approved content
    let contentQuery;
    if (content_id) {
      contentQuery = await db.query(
        `SELECT id, type, title, body, meta_description, seo_keywords, author
         FROM content
         WHERE id = $1 AND approved = true AND published_at IS NULL`,
        [content_id]
      );
    } else {
      contentQuery = await db.query(
        `SELECT id, type, title, body, meta_description, seo_keywords, author
         FROM content
         WHERE approved = true AND published_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ${batch_publish ? 5 : 1}`
      );
    }

    if (!contentQuery.rows.length) {
      return {
        success: true,
        message: 'No approved content pending publication',
        published_count: 0,
      };
    }

    const publishResults = [];

    for (const content of contentQuery.rows) {
      try {
        // 3. Build prompt for Gemini
        const userPrompt = `Prepare this content for web publication on drooid.org:

Title: ${content.title}
Type: ${content.type}
Author: ${content.author}
Meta Description: ${content.meta_description}
SEO Keywords: ${JSON.parse(content.seo_keywords).join(', ')}

Content:
${content.body}

Requirements:
1. Convert to semantic HTML5 with proper structure
2. Generate a URL slug (SEO-friendly, lowercase, hyphens)
3. Create a table of contents for content longer than 1000 words
4. Add 2-3 image placement suggestions with descriptive captions
5. Create OpenGraph meta tags for social sharing
6. Add schema.org structured data (Article schema)
7. Generate a short author bio snippet (2-3 sentences, include Drooid affiliation)
8. Create internal link suggestions (point to other Drooid content on similar topics)
9. Format code blocks with language tags for syntax highlighting
10. Ensure heading hierarchy is correct (H1 for title, H2 for sections)

Output as JSON:
{
  "slug": "...",
  "canonical_url": "https://drooid.org/...",
  "html": "...",
  "meta_tags": {
    "title": "...",
    "description": "...",
    "keywords": [...]
  },
  "og_tags": {
    "title": "...",
    "description": "...",
    "image": "..."
  },
  "schema_markup": {...},
  "table_of_contents": [...],
  "image_placements": [{ "location": "...", "alt_text": "...", "caption": "..." }],
  "author_bio": "...",
  "internal_links": [{ "anchor": "...", "target_url": "..." }],
  "estimated_read_time": 0,
  "seo_score": 0
}`;

        // 4. Call Gemini
        const response = await callGemini(userPrompt, SYSTEM_PROMPT);

        let publishData;
        try {
          publishData = JSON.parse(response);
        } catch (parseErr) {
          throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
        }

        // Validate required fields
        if (!publishData.slug || !publishData.html || !publishData.canonical_url) {
          throw new Error('Gemini response missing required fields');
        }

        // 5. Update content record with publication data
        const updateQuery = await db.query(
          `UPDATE content
           SET published_at = NOW(),
               slug = $1,
               canonical_url = $2,
               html_content = $3,
               publishing_metadata = $4,
               status = $5
           WHERE id = $6
           RETURNING id, slug, published_at`,
          [
            publishData.slug,
            publishData.canonical_url,
            publishData.html,
            JSON.stringify({
              meta_tags: publishData.meta_tags,
              og_tags: publishData.og_tags,
              schema_markup: publishData.schema_markup,
              table_of_contents: publishData.table_of_contents,
              author_bio: publishData.author_bio,
              internal_links: publishData.internal_links,
              estimated_read_time: publishData.estimated_read_time,
              seo_score: publishData.seo_score,
            }),
            'published'
          ],
          [content.id]
        );

        if (!updateQuery.rows.length) {
          throw new Error('Failed to update content record');
        }

        // 6. Store image placement suggestions
        for (const img of publishData.image_placements) {
          await db.query(
            `INSERT INTO content_assets (content_id, asset_type, location, alt_text, caption)
             VALUES ($1, $2, $3, $4, $5)`,
            [content.id, 'image_placeholder', img.location, img.alt_text, img.caption]
          );
        }

        // 7. Log success
        await db.logAgentAction(AGENT_ID, 'published', {
          content_id: content.id,
          slug: publishData.slug,
          url: publishData.canonical_url,
          seo_score: publishData.seo_score,
        });

        publishResults.push({
          content_id: content.id,
          title: content.title,
          slug: publishData.slug,
          canonical_url: publishData.canonical_url,
          seo_score: publishData.seo_score,
          read_time: publishData.estimated_read_time,
          status: 'published',
        });
      } catch (contentError) {
        await db.logAgentAction(AGENT_ID, 'error', {
          content_id: content.id,
          error: contentError.message,
        });

        publishResults.push({
          content_id: content.id,
          title: content.title,
          status: 'error',
          error: contentError.message,
        });
      }
    }

    return {
      success: true,
      published_count: publishResults.filter((r) => r.status === 'published').length,
      failed_count: publishResults.filter((r) => r.status === 'error').length,
      results: publishResults,
      message: `Published ${publishResults.filter((r) => r.status === 'published').length} items`,
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
