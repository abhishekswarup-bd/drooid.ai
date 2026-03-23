# Drooid Sales Engine - Agent Documentation
## CREATE, INNOVATE & PARTNER Phase Agents (18-26)

**Created:** March 22, 2026
**Total Agents:** 9 production-ready Node.js modules
**Base Path:** `/sessions/inspiring-dreamy-thompson/drooid-sales-engine/agents/`
**Architecture:** Gemini 2.5 Flash + Supabase + Custom Approval Workflows

---

## OVERVIEW

The Drooid Sales Engine comprises 29 autonomous agents across 5 operational phases:
- **DISCOVER** (Agents 1-3): Prospect identification & ICP profiling
- **ENGAGE** (Agents 4-9): Outreach & relationship building
- **CONVERT** (Agents 10-17): Deal progression & closing
- **CREATE** (Agents 18-22): Content & marketing assets
- **INNOVATE** (Agents 23-25): Strategic optimization & growth
- **PARTNER** (Agent 26): Partnership development
- **MANAGE** (Agents 27-29): Operations & quality (future)

This document covers agents 18-26 (CREATE, INNOVATE, PARTNER phases).

---

## CREATE PHASE AGENTS (18-22)

### Agent #18: Thought Leadership Creator
**File:** `/create/18-thought-leadership-creator.js` (162 lines)

**Purpose:** Generate authoritative, long-form blog posts for drooid.org that establish AI expertise and drive inbound leads.

**Inputs:**
- `trending_topics` (array): Current industry trends
- `prospect_pain_points` (array): Customer challenges from ICP data
- `seo_keywords` (array): Target keywords for search optimization
- `article_angle` (string): Specific angle for the article
- `author_name` (string, default: "Drooid Team")

**Process:**
1. Validates inputs and logs agent start
2. Calls Gemini with detailed content strategist prompt
3. Parses JSON response (headline, meta_description, body, SEO keywords, etc.)
4. Inserts content record into Supabase with status='draft'
5. Creates approval record requiring CEO review
6. Returns preview and metadata

**Outputs:**
- Content stored in `content` table (type='blog')
- Approval record created in `approvals` table (reviewer_role='ceo')
- Success response includes: content_id, approval_id, headline, word_count, reading_time

**Requirements:**
- Requires approval: YES (CEO must review before publishing)
- Target length: 1,200-2,000 words
- Writing style: Technical but accessible, opinionated, practical, outcome-focused
- SEO-optimized with meta description, headers, internal links

**Key Features:**
- Multi-paragraph SYSTEM_PROMPT establishes Drooid brand voice
- Detailed JSON validation and error handling
- Automatic token cost tracking via logging
- Links to approval workflow for governance

---

### Agent #19: Website Publisher
**File:** `/create/19-website-publisher.js` (230 lines)

**Purpose:** Convert approved markdown content to publication-ready HTML, handling SEO optimization, metadata, and brand consistency.

**Inputs:**
- `content_id` (string, optional): Specific content to publish
- `batch_publish` (boolean, default: false): Publish multiple approved items

**Process:**
1. Fetches approved content (approved=true, published_at=null) from Supabase
2. For each content item:
   - Calls Gemini to convert to HTML with semantic structure
   - Generates meta tags, OpenGraph tags, schema markup
   - Suggests image placements with alt text
   - Creates table of contents for longer articles
   - Generates internal linking strategy
3. Updates content record with published_at timestamp, slug, canonical_url
4. Stores image placement suggestions in content_assets table
5. Returns detailed publishing metadata

**Outputs:**
- Content record updated with published_at, slug, html_content
- Publishing metadata stored (meta_tags, og_tags, schema_markup, etc.)
- Image asset suggestions in content_assets table
- Success response includes: published_count, failed_count, SEO scores

**Requirements:**
- Requires approval: YES (final publish check before going live)
- Brand color consistency: Indigo (#4338CA), Teal (#0D9488), Dark (#0F1117)
- Semantic HTML5 with proper heading hierarchy
- Schema.org structured data for search engines

**Key Features:**
- Batch publishing capability for efficiency
- Comprehensive SEO scoring
- Brand guideline enforcement
- Error handling per-content item (doesn't block entire batch)

---

### Agent #20: Social Media Manager
**File:** `/create/20-social-media-manager.js` (306 lines)

**Purpose:** Generate platform-specific social media content (LinkedIn & Twitter/X) to drive engagement and thought leadership.

**Inputs:**
- `source_content_id` (string, optional): Blog post to adapt for social
- `industry_news` (array): News hooks for commentary
- `engagement_data` (object): Recent performance metrics
- `theme` (string): Monthly theme or topic
- `batch_generate` (boolean): Generate multiple content sets

**Process:**
1. Fetches published content or engagement metrics from Supabase
2. Analyzes recent performance trends (what resonated?)
3. Calls Gemini to generate:
   - 3 LinkedIn posts (150-300 words, discussion questions, hooks)
   - 4 Twitter/X posts (under 280 chars, punchy, mix of types)
4. Stores each post as content record (platform-specific metadata)
5. Creates social_post_metadata with word count, best posting times, engagement expectations
6. Creates approval records for marketing review
7. Returns posting schedule and engagement notes

**Outputs:**
- Content records created with type='social' (one per post)
- Social_post_metadata with posting times and performance expectations
- Approval records for marketing (reviewer_role='marketing')
- Success response includes: linkedin_posts_count, twitter_posts_count, posting_schedule

**Requirements:**
- Requires approval: YES (all public content must be reviewed)
- LinkedIn: 5 posts/week, 150-300 words, discussion-oriented
- Twitter/X: 7 posts/week, under 280 chars, punchy and specific
- No generic corporate speak, data-driven content

**Key Features:**
- Platform-specific formatting and tone
- Engagement performance prediction
- Optimal posting time suggestions
- Discussion question generation for LinkedIn
- Recent performance trending for optimization

---

### Agent #21: SEO Optimizer
**File:** `/create/21-seo-optimizer.js` (304 lines)

**Purpose:** Audit published content for SEO performance and provide actionable optimization recommendations.

**Inputs:**
- `content_id` (string, optional): Specific content to audit
- `analyze_all` (boolean): Audit all published content
- `google_search_console_data` (object): Search performance metrics

**Process:**
1. Fetches published content (published_at IS NOT NULL)
2. Queries Google Search Console data if provided
3. Calls Gemini for comprehensive SEO audit analyzing:
   - Keyword optimization and coverage
   - Title tag & meta description effectiveness
   - Header structure (H1-H3 hierarchy)
   - Content quality and depth
   - Internal linking strategy
   - Technical SEO (mobile, images, schema)
   - Content gaps vs. competitors
4. Stores audit results in content_audits table
5. Creates content_audit recommendations for tracking
6. Logs analysis completion with scores

**Outputs:**
- Audit record created in content_audits table (type='seo_comprehensive')
- SEO audit content stored (type='seo_audit') with improvement recommendations
- Success response includes: audit_id, seo_score (0-100), improvement categories

**Requirements:**
- Requires approval: NO (internal analysis, no approvals needed)
- Returns specific, actionable recommendations (not generic advice)
- Benchmarks against current rankings and competitor content
- Prioritizes recommendations by impact/effort

**Key Features:**
- 10-dimension audit framework (funnel health, agents, channels, A/B tests, etc.)
- Bottleneck identification and quick-win prioritization
- Content gap analysis vs. competitors
- Improvement roadmap (week 1, 2-4, month 2-3)

---

### Agent #22: Event & Webinar Agent
**File:** `/create/22-event-webinar-agent.js` (335 lines)

**Purpose:** Plan comprehensive virtual events and webinars that generate qualified leads and establish thought leadership.

**Inputs:**
- `webinar_topic` (string): Event topic or angle
- `target_company_size` (string): Target audience size
- `industry_focus` (string): Specific industry if applicable
- `speaker_bios` (array): Available speakers
- `promotion_channels` (array): Where to promote (linkedin, email, twitter)
- `event_date` (string): Proposed event date

**Process:**
1. Fetches recent webinar performance benchmarks
2. Calls Gemini to create comprehensive event plan including:
   - Event overview, learning outcomes, target personas
   - Speaker strategy and talking points
   - Detailed agenda (45 min total: 30 min presentation, 10 min Q&A, 5 min CTA)
   - Registration page copy with urgency elements
   - 3-week promotion plan (messaging, channels, content pieces)
   - Follow-up email sequence (Day 0, 1, 3, 7, 14, 21)
   - Success metrics and execution checklist
3. Stores event record in events table
4. Creates promotion plan content (week 1, 2, 3)
5. Creates follow-up email sequence as content records
6. Creates approval record for marketing
7. Returns full event plan with checklists

**Outputs:**
- Event record created in events table
- Promotion content (3 records) in content table (type='event_promotion')
- Email sequence (6 records) in content table (type='event_email')
- Approval record for marketing review
- Success response includes: event_date, registration_goal, demo_request_goal, checklist_items

**Requirements:**
- Requires approval: YES (event commitment requires marketing sign-off)
- Cadence: 1 webinar/month with 3-week promotion cycle
- Structure: 45 minutes max (30 content + 10 Q&A + 5 CTA)
- Follow-up sequence: 6 strategic emails over 21 days

**Key Features:**
- Historical performance benchmarking
- Complete 3-week promotion strategy
- 6-email nurture sequence with specific send times
- Speaker strategy and demo script
- Execution checklist (pre-event, during, post-event)
- Success metrics and registration goals

---

## INNOVATE PHASE AGENTS (23-25)

### Agent #23: Revenue Ideation Engine
**File:** `/innovate/23-revenue-ideation.js` (299 lines)

**Purpose:** Generate and evaluate new revenue opportunities, pricing models, and go-to-market strategies.

**Inputs:**
- `current_revenue` (number): Current annual revenue
- `pipeline_value` (number): Current open pipeline
- `win_loss_analysis` (object): Why we win/lose deals
- `customer_feedback` (array): Recent feedback themes
- `market_trends` (array): Industry signals
- `generate_count` (number): How many ideas (default: 5)

**Process:**
1. Fetches sales metrics (customer count, avg deal, win rate) from last 6 months
2. Fetches customer feedback themes and sentiment distribution
3. Calls Gemini to generate revenue ideas across:
   - Revenue expansion (upsells, cross-sells, pricing)
   - New service offerings
   - Vertical specialization
   - Partnership models
   - Market expansion
4. For each idea captures: name, revenue potential, effort estimate, quick experiment design
5. Stores strategic initiatives in strategic_initiatives table
6. Creates approval records for high-priority ideas (revenue_role='ceo')
7. Returns prioritized ideas with implementation roadmap

**Outputs:**
- Strategic initiative records (type='revenue_idea', status='proposed')
- Approval records for high-impact ideas
- Success response includes: ideas_generated, high_priority_count, total_potential_revenue

**Requirements:**
- Requires approval: YES (strategic decisions require CEO review)
- Output is specific ideas (not vague suggestions)
- Each idea includes: revenue potential, effort estimate, quick 1-month experiment design
- 3 priority levels (high/medium/low) based on impact/effort ratio

**Key Features:**
- 8 revenue opportunity categories (upsell, new services, partnerships, etc.)
- Specific target segments and estimated deal counts
- Quick experiment design for validation
- Risk assessment and mitigation strategies
- 90-day implementation roadmap

---

### Agent #24: Analytics & Performance Optimizer
**File:** `/innovate/24-analytics-optimizer.js` (397 lines)

**Purpose:** Analyze sales funnel health, agent performance, and provide optimization recommendations.

**Inputs:**
- `analysis_period_days` (number, default: 90): Period to analyze
- `include_ab_tests` (boolean): Analyze active A/B tests
- `compare_agents` (boolean): Compare agent performance
- `focus_area` (string): Area to focus on

**Process:**
1. Fetches funnel metrics by stage (count, conversions, days in stage, deal value)
2. Fetches agent performance (throughput, win rate, response rate, token efficiency)
3. Fetches channel performance (email, LinkedIn, Twitter, etc.)
4. Fetches active A/B test results
5. Calls Gemini for comprehensive analysis:
   - Funnel bottlenecks and leakage analysis
   - Agent performance insights (top/bottom performers, specialization)
   - Channel performance (best/worst, ROI)
   - A/B test winners and significance
   - Critical bottlenecks (what's limiting growth?)
   - Specific tuning recommendations (messaging, timing, segmentation)
6. Stores analysis in agent_metrics table
7. Creates action items (optimization tasks) for improvement
8. Logs bottleneck count and recommendations

**Outputs:**
- Analytics record in agent_metrics table (metric_type='optimization_analysis')
- Action item records with effort_hours and timeline
- Success response includes: seo_score, agent_insights, bottleneck_count, projected_improvements

**Requirements:**
- Requires approval: NO (internal analysis)
- Returns specific, measurable recommendations (not vague advice)
- Includes A/B test result interpretation and next test recommendations
- Projected improvement estimates for each recommendation

**Key Features:**
- 8 analysis dimensions (funnel health, agents, channels, timing, segments, etc.)
- Bottleneck identification and root cause analysis
- Agent specialization insights
- Channel performance ROI calculation
- A/B test statistical significance assessment
- 3-tier roadmap (week 1 quick wins, medium-term, strategic initiatives)

---

### Agent #25: Reputation Builder
**File:** `/innovate/25-reputation-builder.js` (436 lines)

**Purpose:** Monitor online reputation, identify response opportunities, and build brand authority.

**Inputs:**
- `monitor_web` (boolean): Monitor web mentions
- `monitor_social` (boolean): Monitor social mentions
- `monitor_reviews` (boolean): Monitor review platforms
- `generate_opportunities` (boolean): Generate opportunities
- `focus_area` (string): Area to focus on

**Process:**
1. Fetches brand mentions (Google Alerts, social, reviews) from last 30 days
2. Calculates sentiment distribution (positive/negative/neutral)
3. Analyzes mentions by source and context
4. Fetches review data from platforms (G2, Clutch, etc.)
5. Calls Gemini for comprehensive reputation analysis:
   - Sentiment score and trend
   - Mention themes and competitive positioning
   - Review insights and unreplied reviews
   - Misinformation to address
   - Thought leadership opportunities (guest posts, podcasts, speaking)
   - Influencer and analyst relationships to build
   - Response drafts for significant mentions
6. Stores reputation report in reputation_reports table
7. Creates response drafts for marketing review
8. Creates approval records for high-priority responses
9. Returns reputation health score and action items

**Outputs:**
- Reputation report record in reputation_reports table
- Response draft records in response_drafts table (requires_approval=true)
- Approval records for public responses
- Success response includes: sentiment_score, sentiment_trend, action_items, opportunities

**Requirements:**
- Requires approval: YES (all public responses must be reviewed)
- Monitors: direct mentions, reviews, social media, competitor comparisons
- Generates: response drafts, thought leadership opportunities, relationship strategies
- Identifies: misinformation, positive mentions to amplify, engagement opportunities

**Key Features:**
- 30-day mention trending with sentiment analysis
- Unreplied review identification with response drafts
- Competitive mention analysis
- Thought leadership opportunity identification (guest posts, podcasts, speaking)
- Influencer relationship strategy
- 30-day action plan with priorities

---

## PARTNER PHASE AGENT (26)

### Agent #26: Alliance Manager
**File:** `/partner/26-alliance-manager.js` (499 lines)

**Purpose:** Identify, evaluate, and manage strategic partnerships that accelerate revenue and market expansion.

**Inputs:**
- `partnership_type` (string): Type to focus on ('channel', 'technology', 'capability', 'customer', 'influencer', 'all')
- `target_market` (string): Market to focus on
- `priority_level` (string): Priority ('high', 'medium', 'low')
- `evaluate_existing` (boolean): Evaluate current partnerships

**Process:**
1. Fetches existing partnerships and market segment data
2. Analyzes market opportunities and gaps
3. Calls Gemini to identify partnership opportunities across:
   - Channel partners (management consultancies, SIs, VARs, resellers)
   - Technology partners (CRM, data platforms, cloud providers)
   - Capability partners (industry experts, geographic expansion)
   - Customer partners (references, case studies, co-marketing)
   - Strategic expansion partnerships (new markets/verticals)
4. For each partner: evaluates fit score (1-10), revenue potential, integration effort
5. Stores partnership records in partnerships table
6. Creates outreach plans for high-fit partners (fit_score >= 7)
7. Creates approval records for highest priority (fit_score >= 8)
8. Returns prioritized partnership list with 90-day activation plan

**Outputs:**
- Partnership records created in partnerships table
- Outreach plan records for qualified partners
- Approval records for CEO review (high-priority partnerships)
- Customer partnership records in customer_partnerships table
- Success response includes: partners_identified, created_records, opportunity_value, top_partners

**Requirements:**
- Requires approval: YES (CEO must approve strategic partnerships)
- Fit scoring based on: market reach, technical compatibility, cultural alignment, revenue potential
- Returns specific partner names and outreach approaches (not generic categories)
- Includes decision-maker profiles and personalized pitch frameworks

**Key Features:**
- 5 partnership categories (channel, technology, capability, customer, strategic)
- Fit score calculation (1-10) against evaluation criteria
- Revenue potential estimation per partner type
- Outreach strategy with decision-maker profiles and email pitches
- 90-day activation plan (immediate, medium-term, long-term)
- Strategic expansion recommendations (new verticals, geographies)

---

## AGENT ARCHITECTURE & PATTERNS

### Universal Agent Structure

Each agent follows this pattern:

```javascript
const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-XX';
const AGENT_NAME = 'Agent Name';
const SYSTEM_PROMPT = `Detailed multi-paragraph prompt...`;

async function run(context = {}) {
  try {
    // 1. Gather inputs from context
    // 2. Query Supabase for supporting data
    // 3. Build user prompt
    // 4. Call Gemini with system + user prompt
    // 5. Parse JSON response
    // 6. Validate required fields
    // 7. Store results in Supabase
    // 8. Create approval records if needed
    // 9. Log completion
    // 10. Return structured results
  } catch (error) {
    await db.logAgentAction(AGENT_ID, 'error', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };
```

### Common Patterns

**1. Input Validation**
- Check required fields, provide helpful error messages
- Use sensible defaults for optional parameters
- Validate data types

**2. Database Queries**
- Fetch supporting data before calling Gemini (benchmarks, recent performance, existing records)
- Always check query.rows.length before accessing
- Use parameterized queries ($1, $2) to prevent SQL injection

**3. Gemini Integration**
- Pass detailed context in user prompt
- Include examples and expected output format
- Request JSON response for structured parsing

**4. Result Storage**
- Store main results in primary table (content, events, partnerships, etc.)
- Store supporting data in metadata fields as JSON strings
- Create approval records for items requiring review

**5. Error Handling**
- Catch parse errors when parsing Gemini response
- Validate critical fields in response
- Log all errors with context
- Return { success: false, error: string } on failure

**6. Approval Workflow**
- Create approval records in `approvals` table
- Specify reviewer_role (ceo, marketing, sales, etc.)
- Set status='pending' for new approvals
- Track approval_id in agent response

**7. Logging**
- Log agent start with input parameters
- Log key milestones (fetch complete, Gemini called, stored in DB)
- Log completion with summary metrics
- Log errors with full context

### Gemini Integration
All agents use `callGemini(userPrompt, systemPrompt)` which:
- Takes a detailed system prompt (role, objectives, constraints, output format)
- Takes a user prompt (context, specific request, data, output structure)
- Returns raw response (string) that must be parsed as JSON
- Tracks token usage for cost optimization

### Database Integration
All agents use `db` module with methods:
- `db.query(sql, params)` - Execute parameterized SQL queries
- `db.logAgentAction(agent_id, action, metadata)` - Log agent activity
- Returns `{ rows: [...] }` or throws error

---

## AGENT DEPENDENCIES & DATAFLOW

```
AGENT 18 (Thought Leadership Creator)
  ↓ creates
AGENT 19 (Website Publisher) [requires approval from 18]
  ↓ publishes
AGENT 20 (Social Media Manager) [reads published content]
  ↓ shares
AGENT 21 (SEO Optimizer) [audits published content]

AGENT 22 (Event & Webinar Agent)
  ↓ references
AGENT 20 (Social Media Manager) [promotion]

AGENT 23 (Revenue Ideation)
  ↓ inputs
Sales metrics, win/loss data, market trends

AGENT 24 (Analytics Optimizer)
  ↓ analyzes
Funnel health, agent performance, A/B tests
  ↓ generates
Recommendations → AGENT 23 (Revenue Ideation) may refine ideas

AGENT 25 (Reputation Builder)
  ↓ monitors
Web, social, reviews
  ↓ generates
Response drafts, thought leadership ideas → AGENT 18 (Content)

AGENT 26 (Alliance Manager)
  ↓ identifies
Potential partners
  ↓ creates outreach
→ ENGAGE agents (4-9) for partnership outreach
```

---

## APPROVAL WORKFLOW

Agents that require approvals:

| Agent | Record Type | Reviewer Role | Description |
|-------|------------|---------------|-------------|
| 18 | content_publish | ceo | Blog posts |
| 19 | content_publish | marketing | Final publish check |
| 20 | social_post | marketing | All public social posts |
| 22 | event_plan | marketing | Event commitments |
| 23 | revenue_idea | ceo | Strategic initiatives |
| 25 | reputation_response | marketing | Public responses |
| 26 | partnership_approval | ceo | Strategic partnerships |

---

## ERROR HANDLING & EDGE CASES

### Common Errors & Solutions

**1. Gemini Parse Failure**
```javascript
try {
  data = JSON.parse(response);
} catch (parseErr) {
  throw new Error(`Failed to parse Gemini response: ${parseErr.message}`);
}
```
Solution: Re-prompt with stricter JSON format instructions

**2. Missing Response Fields**
```javascript
if (!data.headline || !data.body) {
  throw new Error('Gemini response missing required fields');
}
```
Solution: Validate critical fields before processing

**3. Database Insert Failure**
```javascript
if (!recordQuery.rows.length) {
  throw new Error('Failed to insert record');
}
```
Solution: Check row count before accessing record ID

**4. Empty Context Data**
```javascript
if (!trending_topics.length && !article_angle) {
  throw new Error('Must provide either trending_topics or article_angle');
}
```
Solution: Require at least one input parameter

---

## PERFORMANCE OPTIMIZATION

### Token Efficiency
- Agents batch operations where possible (Agent 19, 20 batch modes)
- Limit array slices to reasonable sizes (e.g., `.slice(0, 15)`)
- Cache benchmark queries instead of recalculating
- Reuse context data across multiple operations

### Database Efficiency
- Use specific column selection in queries (avoid SELECT *)
- Add date filters to queries (e.g., created_at > NOW() - INTERVAL)
- Use LIMIT to constrain result sets
- Batch insert operations where possible

### Gemini Prompt Optimization
- Include benchmarks/examples in context
- Request specific output format (JSON with field definitions)
- Provide constraints (word count, format requirements)
- Include success criteria and validation rules

---

## TESTING & VALIDATION

### Test Cases for Each Agent

**18 - Thought Leadership Creator**
- [ ] Valid inputs generate article with 1200-2000 word range
- [ ] Meta description is 155-160 characters
- [ ] Internal links included (2-3)
- [ ] Approval record created with reviewer_role='ceo'
- [ ] Error handling for missing required inputs

**19 - Website Publisher**
- [ ] Single content publish succeeds
- [ ] Batch publish processes multiple items
- [ ] HTML is valid semantic markup
- [ ] Schema markup is valid JSON-LD
- [ ] Image placements suggested with alt text

**20 - Social Media Manager**
- [ ] LinkedIn posts are 150-300 words
- [ ] Twitter posts are under 280 chars
- [ ] Posting times suggested for both platforms
- [ ] Approval records created for marketing
- [ ] Engagement expectations set

**21 - SEO Optimizer**
- [ ] Audit returns 0-100 score
- [ ] Bottlenecks identified with recommendations
- [ ] Quick wins prioritized above medium-term
- [ ] No approval needed (internal analysis)
- [ ] Handles multiple content audits in batch

**22 - Event & Webinar Agent**
- [ ] Event plan has 45-minute agenda
- [ ] Registration goal is reasonable (200-400)
- [ ] Follow-up sequence has 6 emails
- [ ] Promotion plan covers 3 weeks
- [ ] Approval created for marketing review

**23 - Revenue Ideation**
- [ ] Ideas are specific (not vague)
- [ ] Revenue potential estimated per idea
- [ ] Quick experiment designed (1 month)
- [ ] Roadmap spans 90 days
- [ ] High-priority ideas queued for CEO approval

**24 - Analytics Optimizer**
- [ ] Funnel health analyzed by stage
- [ ] Agent performance compared
- [ ] Bottlenecks identified with fixes
- [ ] Quick wins prioritized
- [ ] No approval needed
- [ ] Projected improvements estimated

**25 - Reputation Builder**
- [ ] Sentiment score calculated (-100 to +100)
- [ ] Mentions categorized by source/sentiment
- [ ] Response drafts provided for reviews
- [ ] Thought leadership opportunities identified
- [ ] Action items prioritized

**26 - Alliance Manager**
- [ ] Channel partners fit scored and ranked
- [ ] Technology partner integrations evaluated
- [ ] Fit scores drive prioritization
- [ ] Outreach plans created for top partners
- [ ] 90-day activation plan provided

---

## DEPLOYMENT CHECKLIST

- [ ] All 9 agents created in correct directories
- [ ] Each agent has AGENT_ID, AGENT_NAME, SYSTEM_PROMPT, run() function
- [ ] Error handling implemented with db.logAgentAction()
- [ ] Approval records created where required
- [ ] Database queries use parameterized statements
- [ ] Gemini integration tested with sample prompts
- [ ] Response parsing validates critical fields
- [ ] Success/failure return formats consistent
- [ ] No hardcoded values (use context parameters)
- [ ] All database field names match schema

---

## INTEGRATION WITH EXISTING AGENTS

These 9 agents integrate with the existing 17 agents (1-17):

**Inbound Data from DISCOVER/ENGAGE/CONVERT phases:**
- Prospect data from Agent 1 (Prospect Scout)
- Decision maker insights from Agent 2 (Decision Maker Finder)
- ICP profiles from Agent 3 (ICP Profiler)
- Engagement patterns from Agents 4-9
- Deal progress from Agents 10-17
- Win/loss data from Agent 15 (Win/Loss Analyst)

**Outbound Data to DISCOVER/ENGAGE/CONVERT phases:**
- Content from Agents 18-20 used in Agent 5 (Email Sequences)
- Social content from Agent 20 for Brand building
- Event data from Agent 22 for Lead generation
- Partnership opportunities from Agent 26 for channel Agents 4-9

---

## OPERATIONAL NOTES

1. **Agent Scheduling:** Agents should run on defined schedules:
   - Agent 18: Weekly (creates blog content)
   - Agent 19: Twice weekly (publishes approved content)
   - Agent 20: Twice daily (social media timing)
   - Agent 21: Weekly (SEO optimization)
   - Agent 22: Monthly (event planning)
   - Agent 23: Monthly (revenue ideation)
   - Agent 24: Weekly (performance analysis)
   - Agent 25: Daily (reputation monitoring)
   - Agent 26: Weekly (partnership evaluation)

2. **Approval Turnaround:** Target approval response times:
   - Marketing (Agents 19, 20, 25): 1-2 hours
   - CEO (Agents 18, 23, 26): 1-2 business days

3. **Data Quality:** Ensure input data is current:
   - Market trends updated weekly
   - Sales metrics refreshed daily
   - Social engagement metrics updated hourly
   - Brand mentions checked continuously

4. **Monitoring:** Track agent health metrics:
   - Success rate per agent
   - Average response time
   - Token efficiency trends
   - Approval acceptance rate

---

**End of Documentation**

Generated: March 22, 2026
Authors: Drooid Engineering Team
Status: Production Ready
