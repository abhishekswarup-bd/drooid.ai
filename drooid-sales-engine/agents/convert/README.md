# Drooid Sales Engine - Conversion Agents

Production-ready autonomous sales agents for deal progression, analysis, and customer engagement. All agents run on Gemini 2.5 Flash with Supabase backend.

## Agent Overview

### Agent #10: Pre-Call Researcher
**File:** `10-pre-call-researcher.js`

Prepares comprehensive pre-meeting briefing dossiers for executives.

- **Input:** lead_id, contact_id, meeting_details
- **Output:** Structured briefing (exec_summary, talking_points, questions_to_ask, potential_objections, competitive_context)
- **Storage:** pipeline.notes + content table (type: pre_call_brief)
- **Approval Required:** No
- **Key Features:**
  - Deep research on prospect company (90-day news, tech stack, pain points)
  - Industry-specific objections and talking points
  - Confidence scoring on research quality
  - 5-minute executive consumption format

---

### Agent #11: Proposal Writer
**File:** `11-proposal-writer.js`

Generates custom, winning proposals after qualified meetings.

- **Input:** lead_id, contact_id, meeting_notes, requirements (pain_points, use_case, budget)
- **Output:** Full markdown proposal + deal_value estimate + win probability
- **Storage:** content table (type: proposal) + approval record for CEO review
- **Approval Required:** **YES** - CEO must review before sending
- **Key Features:**
  - Custom-built (never templated) proposals
  - Mirrors prospect's language and challenges
  - Specific agent/workflow recommendations
  - Realistic 4-12 week timelines
  - Value-framed pricing with ROI
  - Deal value and win probability scoring
  - Automatic pipeline stage update to "proposal_sent"

---

### Agent #12: Pipeline Tracker
**File:** `12-pipeline-tracker.js`

Monitors all active deals, flags risks, recommends stage changes.

- **Input:** All pipeline records (stage != closed_won, closed_lost)
- **Output:** Daily health report with categorization (healthy, at-risk, stale)
- **Storage:** agent_metrics table + action recommendations as tasks
- **Approval Required:** No
- **Key Features:**
  - Categorizes deals by health (healthy/at-risk/stale)
  - Flags stale deals (21+ days no activity)
  - Identifies competitive threats and champion departures
  - Stage change suggestions (not auto-applied)
  - Deals needing immediate attention
  - Win predictions (30-day outlook)
  - Creates high-priority tasks from recommendations
  - Suggests which deals to rescue

---

### Agent #13: Nurture Agent
**File:** `13-nurture-agent.js`

Keeps warm leads engaged with valuable, non-salesy touchpoints.

- **Input:** Contacts in nurture stage
- **Output:** Personalized nurture touchpoint per contact
- **Storage:** outreach table (message_type: nurture) with scheduling
- **Approval Required:** **YES** - Outbound content requires approval
- **Key Features:**
  - Never pushes for meetings (consultative posture)
  - Mix of touchpoint types: case studies, insights, thought leadership, events, resources, questions
  - Optimal send timing (Tuesday-Thursday, 9-11am)
  - 7-14 day spacing between touches
  - Engagement tracking (opens, clicks, replies)
  - Automatic follow-up triggers when engagement rises
  - Personalized to their industry/challenge

---

### Agent #14: Competitive Intel
**File:** `14-competitive-intel.js`

Builds battlecards on competitors mentioned in deals.

- **Input:** competitor_name, optional: deal_id or lead_id, force_refresh flag
- **Output:** Competitive battlecard (strengths, weaknesses, differentiation, talking points)
- **Storage:** content table (type: competitive_intel) + optional deal link
- **Approval Required:** No
- **Key Features:**
  - Caches battlecards for 30 days (refresh if needed)
  - Honest assessment (their strengths AND weaknesses)
  - Specific Drooid differentiators
  - Common objections when competing + reframes
  - Talking points with context and evidence
  - Pricing comparison
  - Win strategy for competitive deals
  - Confidence scoring on research quality
  - Links battlecard to specific deals for context

---

### Agent #15: Win/Loss Analyst
**File:** `15-win-loss-analyst.js`

Analyzes closed deals (won and lost) for patterns and actionable insights.

- **Input:** period_days (default: 90), include_lost flag
- **Output:** Structured win/loss report with patterns and recommendations
- **Storage:** agent_metrics table + content table (type: win_loss_analysis)
- **Approval Required:** No
- **Key Features:**
  - Win rate tracking with deal-by-deal analysis
  - Sales cycle length trends
  - Messaging themes that drive wins
  - Champion engagement importance
  - Competitive matchup win rates
  - Timing patterns (when we close best)
  - Objection handling success rates
  - Loss reasons categorization
  - Salvageable vs. lost deals assessment
  - Quarterly trend analysis
  - Specific, actionable recommendations

---

### Agent #16: Referral Generator
**File:** `16-referral-generator.js`

Identifies right moments and methods to request referrals from satisfied customers.

- **Input:** Auto-scans closed_won deals (60 days) + engaged prospects
- **Output:** Personalized referral requests with suggested talking points
- **Storage:** outreach table (message_type: referral_ask) + approval records
- **Approval Required:** **YES** - Outbound requests require approval
- **Key Features:**
  - Readiness scoring (only asks from satisfied customers)
  - Multiple request methods: direct ask, LinkedIn recommendation, case study, mutual introduction
  - Respects frequency (no referral asks within 90 days)
  - Defines target referral profile
  - Suggests talking points for referrer
  - Non-transactional, genuine messaging
  - High success probability scoring
  - Automatic de-duplication (won't ask twice)

---

### Agent #17: Testimonial Collector
**File:** `17-testimonial-collector.js`

Collects testimonials and case study material from satisfied clients.

- **Input:** Closed_won deals 30-90 days old (client had time to see value)
- **Output:** Personalized testimonial request with suggested draft
- **Storage:** outreach table (message_type: testimonial_request) + content table (type: case_study)
- **Approval Required:** **YES** - Outbound requests require approval
- **Key Features:**
  - Ideal window: 30-90 days post-close (value realized)
  - Request types: testimonial, LinkedIn recommendation, case study, video testimonial
  - Suggested testimonial drafts (easy for clients to edit)
  - Includes metrics, outcomes, recommendations
  - Case study potential assessment
  - Creates case study record with pending status
  - Respects timing (won't ask within 180 days)
  - Real, credible client voice (no marketing fluff)
  - Probability scoring for each request

---

## Database Requirements

### Tables Used

- **pipeline:** deals, with notes (briefings), stage, deal_value
- **leads:** company info, website, industry, lead_score
- **contacts:** people at companies, stage, engagement data
- **outreach:** all touchpoints (emails, messages, calls)
- **content:** stored proposals, briefs, battlecards, case studies, analyses
- **approvals:** pending CEO/leadership approvals
- **engagement_tracking:** open/click/reply metrics
- **agent_metrics:** performance data, trend analysis
- **deal_competitive_intel:** links competitors to specific deals
- **tasks:** action items from agents

### Integration Requirements

- **Gemini 2.5 Flash:** All agents use `callGemini()` from `../../integrations/gemini-client`
- **Supabase:** Database operations via `db` from `../../integrations/supabase-client`
- **Logging:** `db.logAgentAction()` for audit trail and error tracking

---

## Agent Execution Pattern

All agents follow this pattern:

```javascript
async function run(context = {}) {
  // 1. Log action start
  // 2. Fetch relevant data from Supabase
  // 3. Build context-aware prompt
  // 4. Call Gemini with system prompt + context
  // 5. Parse and validate JSON output
  // 6. Store results in appropriate tables
  // 7. Create approval records if needed
  // 8. Log action completion
  // 9. Return results object
}
```

### Standard Result Object

```javascript
{
  success: true,
  agent_id: 'agent-XX',
  agent_name: 'Name',
  [agent-specific outputs],
  requires_approval: boolean,
  approval_id: uuid (if applicable),
  duration_ms: number,
  stored_to: { table: 'details' }
}
```

---

## Approval Workflow

Agents requiring approval (`requires_approval: true`):
- Agent #11 (Proposal Writer)
- Agent #13 (Nurture Agent)
- Agent #16 (Referral Generator)
- Agent #17 (Testimonial Collector)

Approval process:
1. Agent generates content and creates approval record
2. Status: "pending" (CEO/leader reviews)
3. CEO can approve/reject via dashboard
4. Approved: message scheduled for sending
5. Rejected: returned with feedback for refinement

---

## Error Handling

All agents:
- Use try/catch blocks
- Log errors via `db.logAgentAction()` with error message
- Return `{success: false, error: message}`
- Include duration_ms in all responses
- Handle partial failures gracefully (e.g., one contact fails, others succeed)

---

## Performance Characteristics

- **Pre-Call Researcher:** 20-30s (research + analysis)
- **Proposal Writer:** 30-45s (detailed content generation)
- **Pipeline Tracker:** 30-60s (full pipeline analysis)
- **Nurture Agent:** 20-30s per contact (batches up to 15)
- **Competitive Intel:** 20-35s (or cached if <30 days old)
- **Win/Loss Analyst:** 30-45s (historical analysis)
- **Referral Generator:** 20-30s per contact (batches up to 20)
- **Testimonial Collector:** 20-30s per contact (batches up to 15)

All use Gemini's streaming-optimized timeouts (20-45s typically).

---

## Integration Checklist

Before deploying:

- [ ] Gemini API key configured
- [ ] Supabase credentials and tables created
- [ ] All foreign key relationships established
- [ ] Indexes on frequently queried fields (lead_id, contact_id, stage, created_at)
- [ ] Approval notification system ready (for agents requiring CEO review)
- [ ] Email sending infrastructure ready (for outreach messages)
- [ ] Engagement tracking webhooks for opens/clicks
- [ ] Monitoring/alerting on agent failures
- [ ] Backup strategy for content records

---

## Usage Examples

```javascript
// Agent #10: Pre-call researcher
const brief = await require('./10-pre-call-researcher').run({
  lead_id: 'lead-123',
  contact_id: 'contact-456',
  meeting_details: {
    date: '2026-03-25',
    topic: 'Sales pitch - AI implementation'
  }
});

// Agent #11: Proposal writer
const proposal = await require('./11-proposal-writer').run({
  lead_id: 'lead-123',
  contact_id: 'contact-456',
  meeting_notes: 'Discovery call revealed 3 key pain points...',
  requirements: {
    main: 'Need to automate sales process',
    pain_points: 'Manual lead scoring, slow response time',
    use_case: 'Sales efficiency',
    budget: 150000
  }
});

// Agent #12: Pipeline tracker
const health = await require('./12-pipeline-tracker').run({});

// Agent #13: Nurture agent
const nurture = await require('./13-nurture-agent').run({});

// Agent #14: Competitive intel
const battlecard = await require('./14-competitive-intel').run({
  competitor_name: 'Competitor X',
  deal_id: 'pipeline-789',
  force_refresh: false
});

// Agent #15: Win/loss analyst
const analysis = await require('./15-win-loss-analyst').run({
  days_back: 90,
  include_lost: true
});

// Agent #16: Referral generator
const referrals = await require('./16-referral-generator').run({});

// Agent #17: Testimonial collector
const testimonials = await require('./17-testimonial-collector').run({});
```

---

## Monitoring & Metrics

All agents create records in `agent_metrics` for:
- Execution duration
- Success/failure rate
- Key outputs (deals analyzed, proposals generated, etc.)
- Confidence scores where applicable

Access performance dashboard via agent_metrics queries grouped by agent_id.

---

## Next Steps

1. Deploy agents to Node.js runtime
2. Create scheduler (every 24h for tracker/nurture, on-demand for others)
3. Build approval UI for CEO review
4. Set up email delivery for outreach
5. Wire engagement tracking (opens, clicks)
6. Create agent dashboard showing metrics
7. Set up alerts for proposal approvals pending
8. Monitor error rates and quality of outputs
