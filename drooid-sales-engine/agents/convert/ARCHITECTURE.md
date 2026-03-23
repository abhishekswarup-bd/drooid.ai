# Drooid Sales Engine - Agent Architecture

## System Overview

Eight production-grade conversion/deal agents operating autonomously on Gemini 2.5 Flash, coordinated through a Supabase backend.

```
┌─────────────────────────────────────────────────────────────┐
│                    DROOID SALES ENGINE                      │
│                  (Autonomous Agent System)                  │
└─────────────────────────────────────────────────────────────┘

                         Gemini 2.5 Flash
                    (LLM for all agents)
                              ▲
                              │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────┴────┐         ┌──────┴────┐         ┌────┴──────┐
    │  Gemini  │         │  Gemini   │         │  Gemini   │
    │ Client   │         │  Client   │         │  Client   │
    │(shared)  │         │(shared)   │         │(shared)   │
    └─────┬────┘         └──────┬────┘         └────┬──────┘
          │                     │                    │
          └─────────────────────┼────────────────────┘
                                │
                    All Agents Use Shared Client
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────┴───────┐      ┌──────┴──────┐      ┌─────┴───────┐
    │   Agent 10  │      │  Agent 11   │      │  Agent 12   │
    │Pre-Call     │      │ Proposal    │      │ Pipeline    │
    │Researcher   │      │ Writer      │      │ Tracker     │
    └─────────────┘      └─────────────┘      └─────────────┘

    ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
    │  Agent 13   │      │  Agent 14    │      │  Agent 15    │
    │  Nurture    │      │ Competitive  │      │  Win/Loss    │
    │   Agent     │      │   Intel      │      │  Analyst     │
    └─────────────┘      └──────────────┘      └──────────────┘

    ┌─────────────┐      ┌──────────────┐
    │  Agent 16   │      │  Agent 17    │
    │  Referral   │      │ Testimonial  │
    │ Generator   │      │  Collector   │
    └─────────────┘      └──────────────┘
          │                     │
          └─────────────┬───────┘
                        │
                   Supabase
                   Database
                        │
    ┌───────────┬───────┼───────┬───────┬──────────┐
    │           │       │       │       │          │
┌───▼───┐ ┌────▼─┐ ┌──▼──┐ ┌──▼──┐ ┌─▼──┐ ┌─────▼─┐
│Pipeline│ │Leads │ │ Ctnts│ │Outrc│ │Cont│ │Apprvl │
│        │ │      │ │     │ │     │ │    │ │       │
└────────┘ └──────┘ └─────┘ └─────┘ └────┘ └───────┘
```

---

## Agent Interaction Map

### Upstream Dependencies (What each agent reads)

```
Agent 10: Pre-Call Researcher
├── Reads: leads, contacts, pipeline (notes context)
└── Purpose: Research before meetings

Agent 11: Proposal Writer
├── Reads: leads, contacts, pipeline, outreach (meeting context)
└── Purpose: Generate proposals after discovery

Agent 12: Pipeline Tracker
├── Reads: pipeline (all active deals), outreach (engagement)
└── Purpose: Daily health monitoring

Agent 13: Nurture Agent
├── Reads: contacts (nurture stage), outreach (recent touches)
└── Purpose: Keep warm leads engaged

Agent 14: Competitive Intel
├── Reads: pipeline (deal context if provided), content (cached battlecards)
└── Purpose: Build or retrieve competitor battlecards

Agent 15: Win/Loss Analyst
├── Reads: pipeline (closed deals), outreach (activity timeline)
└── Purpose: Learn from closed deals

Agent 16: Referral Generator
├── Reads: pipeline (closed_won), contacts (high engagement), outreach (recent asks)
└── Purpose: Generate referral requests

Agent 17: Testimonial Collector
├── Reads: pipeline (closed_won 30-90 days), contacts, outreach (collection history)
└── Purpose: Collect testimonials from satisfied clients
```

### Downstream Outputs (What each agent writes)

```
Agent 10: Pre-Call Researcher
├── Writes: pipeline (notes), content (pre_call_brief)
└── Creates: Briefing for review

Agent 11: Proposal Writer
├── Writes: content (proposal), pipeline (stage update), approvals (pending)
└── Creates: Proposal for CEO approval

Agent 12: Pipeline Tracker
├── Writes: agent_metrics (pipeline health), tasks (recommended actions)
└── Creates: Daily report + action items

Agent 13: Nurture Agent
├── Writes: outreach (scheduled messages), engagement_tracking
└── Creates: Nurture touches

Agent 14: Competitive Intel
├── Writes: content (competitive_intel), deal_competitive_intel (links)
└── Creates: Battlecard (cached)

Agent 15: Win/Loss Analyst
├── Writes: agent_metrics (analysis), content (win_loss_analysis)
└── Creates: Historical analysis

Agent 16: Referral Generator
├── Writes: outreach (referral_ask), approvals (pending)
└── Creates: Referral requests for approval

Agent 17: Testimonial Collector
├── Writes: outreach (testimonial_request), content (case_study), approvals (pending)
└── Creates: Testimonial requests for approval
```

---

## Data Flow Diagram

### Pre-Sales Flow (Agents 10-11)

```
New Lead
  ↓
[Agent 10: Pre-Call Researcher]
  ├─ Gathers deep research
  ├─ Stores brief in pipeline.notes
  └─ Creates briefing content
       ↓
    CEO Reviews Brief
       ↓
  Goes into Meeting
       ↓
[Agent 11: Proposal Writer]
  ├─ Reads meeting notes
  ├─ Generates custom proposal
  ├─ Creates approval record
  └─ Updates pipeline to "proposal_sent"
       ↓
    CEO Reviews & Approves
       ↓
    Send to Prospect
       ↓
  Prospect Decision
```

### Deal Lifecycle Monitoring (Agent 12)

```
All Active Deals
       ↓
[Agent 12: Pipeline Tracker] (Daily)
  ├─ Analyzes deal health
  ├─ Flags at-risk deals
  ├─ Suggests stage changes
  └─ Creates action tasks
       ↓
Sales Team Acts on Recommendations
       ↓
Deals Progress or Risk Mitigated
```

### Lead Nurturing (Agent 13)

```
Contacts in "Nurture" Stage
       ↓
[Agent 13: Nurture Agent] (Daily)
  ├─ Identifies ready-to-touch contacts
  ├─ Generates value-focused touchpoint
  ├─ Schedules optimal send time
  └─ Tracks engagement
       ↓
Contact Engages (Opens, Clicks, Replies)
       ↓
Engagement Triggers Next Touch or Sales Motion
```

### Competitive Context (Agent 14)

```
Competitor Mentioned in Deal
       ↓
[Agent 14: Competitive Intel] (On-demand or scan)
  ├─ Check if cached battlecard exists
  ├─ If <30 days old: return cached
  ├─ If stale/missing: research and generate
  ├─ Create/update battlecard
  └─ Link to deal for context
       ↓
Sales Team Reviews Battlecard
       ↓
Uses Talking Points & Win Strategy
```

### Learning from Outcomes (Agent 15)

```
Deals Close (Won or Lost)
       ↓
[Agent 15: Win/Loss Analyst] (Daily/Weekly/Monthly)
  ├─ Analyzes closed deals
  ├─ Identifies patterns
  ├─ Extracts lessons learned
  └─ Generates recommendations
       ↓
Sales Leadership Reviews Analysis
       ↓
Implement Improvements
```

### Relationship Development (Agents 16-17)

```
Deal Closed Successfully
       ↓
[Agent 16: Referral Generator] (Auto-triggered)
  ├─ Assess client satisfaction
  ├─ Generate personalized referral ask
  └─ Create approval record
       ↓
[Agent 17: Testimonial Collector] (Auto-triggered, 30-90 days post-close)
  ├─ Generate testimonial request
  ├─ Suggest draft testimonial
  └─ Create approval record
       ↓
Approvals + Sends
       ↓
Client Responds
       ↓
Store Testimonial/Referral as Case Study/Lead
```

---

## Data Schema - Key Fields

### pipeline
```
id (uuid)
lead_id (fk)
stage (enum: prospecting, qualified, discovery, proposal_sent, negotiation, closing, closed_won, closed_lost)
deal_value (decimal)
probability (0-1)
expected_close_date (timestamp)
notes (text) ← Used by agents for context + storage
created_at, updated_at
next_action, next_action_date
```

### contacts
```
id (uuid)
lead_id (fk)
first_name, last_name
title
email
stage (enum: prospecting, nurture, qualified, ...)
last_engagement (timestamp)
created_at, updated_at
```

### outreach
```
id (uuid)
lead_id (fk)
contact_id (fk)
outreach_type (email, call, linkedin, etc)
message_type (discovery, nurture, proposal, referral_ask, testimonial_request, etc)
subject, message (text)
status (scheduled, pending_approval, sent, failed)
channel (email, linkedin, phone)
scheduled_at (timestamp)
created_by (agent_id)
metadata (jsonb) ← Stores agent-specific context
created_at
```

### content
```
id (uuid)
type (enum: pre_call_brief, proposal, case_study, competitive_intel, win_loss_analysis)
title
body (markdown/json)
lead_id (fk), contact_id (fk)
created_by (agent_id)
metadata (jsonb)
created_at
```

### approvals
```
id (uuid)
type (enum: proposal_review, referral_request, testimonial_request, nurture_content)
lead_id (fk), contact_id (fk)
status (pending, approved, rejected)
content (text/json)
requested_by (agent_id), approved_by (user_id)
metadata (jsonb)
expires_at (timestamp)
created_at, updated_at
```

### agent_metrics
```
id (uuid)
agent_id
metric_type (pipeline_health, win_loss_analysis, execution_time, etc)
value (decimal)
period_days (int) ← For time-series metrics
metadata (jsonb) ← Agent-specific stats
created_at
```

---

## Request/Response Pattern

### Standard Agent Call

```javascript
// Caller initiates agent
const result = await agent.run(context);

// Agent returns standardized result
{
  success: boolean,
  agent_id: "agent-XX",
  agent_name: "Name",

  // Agent-specific outputs
  [...agent_specific_fields],

  // Approval info (if applicable)
  requires_approval: boolean,
  approval_id: uuid (if created),
  approval_status: "pending_ceo_review" | null,

  // Execution info
  duration_ms: number,
  stored_to: { table: "...", record_id: "..." }
}
```

### Error Response

```javascript
{
  success: false,
  agent_id: "agent-XX",
  error: "Descriptive error message",
  duration_ms: number
  // Parent action_id logged for audit trail
}
```

---

## Approval Workflow

### Agents Requiring Approval

1. **Agent 11 (Proposal Writer):** CEO reviews proposal before sending to prospect
2. **Agent 13 (Nurture Agent):** Outbound nurture content
3. **Agent 16 (Referral Generator):** Referral requests to clients
4. **Agent 17 (Testimonial Collector):** Testimonial requests to clients

### Approval Process

```
Agent Creates Content + Approval Record
  ├─ status: "pending"
  └─ expires_at: 7 days from now
       ↓
CEO/Leader Sees Approval in Dashboard
       ↓
  ┌─ Approve
  │  ├─ Update approval.status = "approved"
  │  ├─ Update outreach.status = "scheduled"
  │  └─ Schedule send
  │
  └─ Reject with Feedback
     ├─ Update approval.status = "rejected"
     └─ Notify agent for refinement
```

---

## Scaling Considerations

### Parallel Execution
- Agents can run in parallel (no blocking dependencies)
- Scheduler can kick off multiple agents simultaneously
- Each agent has independent error handling

### Batching Strategy
- Nurture Agent: processes up to 15 contacts per run
- Referral Generator: processes up to 20 candidates per run
- Testimonial Collector: processes up to 15 candidates per run
- Others: process single entity or full pipeline

### Rate Limiting
- Gemini API: ~30 req/min (configured in client)
- Supabase: standard tier limits
- Email sending: throttled to 100/hour (typical provider)

### Optimization
- Competitive Intel: caches for 30 days (reduces API calls)
- Pipeline Tracker: indexes on stage, updated_at for fast queries
- Agent Metrics: aggregated daily for trend analysis

---

## Monitoring & Alerting

### Key Metrics to Track

1. **Agent Execution**
   - Success rate per agent
   - Average execution time
   - Error frequency by type

2. **Output Quality**
   - Approval acceptance rate (proposals, outreach)
   - Engagement on generated content
   - Win rate by agent output

3. **Business Impact**
   - Deals progressed by tracker
   - Proposals generated → closed
   - Referrals → new leads
   - Testimonials → content library

### Alerting Rules

- Agent execution time > 60s → investigate
- Error rate > 10% → escalate
- Approval expiry approaching → notify
- Stale deals count rising → alert
- Outreach delivery failures → retry + notify

---

## Security & Compliance

### Data Access
- Agents only access data for their function
- All database operations logged
- Audit trail via agent_metrics + action logs

### Content Generation
- Proposals, outreach: require approval before sending
- No sensitive data (SSN, API keys) in prompts
- Client data anonymized in competitive analysis

### Error Handling
- No PII in error messages
- Errors logged with context but sanitized
- Failed outreach attempts tracked

---

## Deployment Checklist

- [ ] Gemini API configured and tested
- [ ] Supabase database and tables created
- [ ] All foreign keys and indexes in place
- [ ] Node.js runtime environment ready
- [ ] Scheduler configured (cron or equivalent)
- [ ] Approval notification system ready
- [ ] Email delivery service integrated
- [ ] Error alerting configured
- [ ] Monitoring dashboard created
- [ ] Backup strategy for content/approvals
- [ ] Rate limiting configured
- [ ] SSL/TLS for all API calls
- [ ] Database backups scheduled
- [ ] Agent performance baselines established

---

## Extension Points

### Add New Agent

1. Create `XX-agent-name.js` in `/agents/convert/`
2. Implement standard pattern (log, fetch, prompt, parse, store, approve if needed, return)
3. Update README with agent description
4. Configure scheduler trigger
5. Add to monitoring dashboard

### Customize Prompts

- Edit SYSTEM_PROMPT in agent file
- Test with sample context
- Update approvals if output structure changes
- Document any special handling

### Integrate with CRM

- Map Supabase pipeline to native CRM stage
- Sync contacts bidirectionally
- Hook outreach messages to CRM activity logs
- Mirror approvals in CRM workflow

---

## Production Readiness Checklist

- [x] All agents have comprehensive error handling
- [x] All agents log actions for audit trail
- [x] All agents validate JSON output from Gemini
- [x] All agents create appropriate approval records
- [x] All agents store results in Supabase
- [x] All agents return standardized result objects
- [x] All agents have detailed system prompts (4-5 paragraphs)
- [x] All agents handle partial failures gracefully
- [x] All agents include metadata for context
- [x] All agents respect approval workflow where required
- [x] All agents include confidence/probability scoring
- [x] All agents batch efficiently to manage API load
- [x] All agents cache results where appropriate
- [x] All agents create content records for storage
- [x] All agents link results back to leads/contacts/deals
