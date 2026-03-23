# Drooid Sales Engine - MANAGE PHASE

This document describes the three management agents and the CEO dashboard that form the MANAGE phase of the Drooid Sales Engine.

## Overview

The MANAGE phase consists of four production-ready modules:
1. **Pipeline Manager (Agent #27)** - Operations coach monitoring throughput and bottlenecks
2. **Quality Manager (Agent #28)** - Chief Quality Officer reviewing all outbound content
3. **Performance Manager (Agent #29)** - Analytics engine tracking KPIs and performance
4. **CEO Dashboard** - Command center for monitoring and approving actions

All agents run on Gemini 2.5 Flash and integrate with Supabase for data storage.

---

## Management Agents

### Agent #27: Pipeline Manager

**File**: `/agents/manage/27-pipeline-manager.js`

**Role**: Operations coach overseeing all 26 worker agents

**Responsibilities**:
- Monitor throughput metrics across all agents (last 24 hours)
- Detect bottlenecks (e.g., Prospect Scout finds 200 leads but Personalization Engine processes 50)
- Track queue depths for each agent
- Identify stalled workflows and trigger retries
- Recommend corrective actions
- Generate operations reports

**Run Schedule**: Every 4 hours (6x/day)

**Input Data**:
- Agent logs from last 24 hours
- Pipeline status (active deals)
- Agent metrics and queue depths

**Output Format**:
```json
{
  "agents_healthy": [{"agent_id": "", "calls": 0, "tokens": 0, "status": ""}],
  "agents_degraded": [{"agent_id": "", "issue": "", "severity": "low|medium|high"}],
  "bottlenecks": [{"source_agent": "", "target_agent": "", "throughput_mismatch": "", "impact": ""}],
  "queue_depths": {"agent_id": {"queue_items": 0, "processing_rate": 0, "backlog_hours": 0}},
  "recommended_adjustments": ["action1", "action2"],
  "corrective_actions_taken": ["action1"],
  "escalations": [{"issue": "", "severity": "low|medium|high", "action_required": ""}],
  "summary": "executive summary"
}
```

**Storage**: `agent_metrics` table

**Approval Required**: NO for monitoring; YES for corrective actions that change agent behavior

**Key Functions**:
- `run(context)` - Main execution function
- `summarizeAgentLogs(logs)` - Aggregates agent log data
- `analyzeQueueDepths(metrics)` - Calculates queue status
- `analyzePipelineStages(pipeline)` - Distributes deals by stage

---

### Agent #28: Quality Manager

**File**: `/agents/manage/28-quality-manager.js`

**Role**: Chief Quality Officer for outbound communications

**Responsibilities**:
- Review all draft outreach content before CEO approval
- Act as the pre-approval quality gate
- Score each piece 1-10 against quality criteria
- Reject below 7 with specific feedback
- Approve 7+ for CEO review

**Quality Criteria**:
1. **Personalization Depth** (1-10): References 2+ specific details about prospect/company
2. **Value Proposition** (1-10): Offers/implies value, never just asks
3. **Brand Voice** (1-10): Confident, technical, peer-to-peer (not salesy)
4. **Accuracy** (1-10): No hallucinated facts
5. **Length Compliance** (1-10): LinkedIn <300 chars, emails <150 words
6. **CTA Appropriateness** (1-10): Soft and natural, not pushy

**Run Schedule**: Every 2 hours during business hours, or triggered by new drafts

**Input Data**:
- All outreach records where `status='draft'` and `approved=false`

**Output Format**:
```json
{
  "reviewed_items": 5,
  "approved": [{"id": "", "channel": "", "score": 8, "reviewer": "agent-28"}],
  "rejected_with_feedback": [{"id": "", "channel": "", "score": 6, "feedback": "...", "originating_agent": ""}],
  "quality_scores": {"item_id": 8},
  "trends": {
    "average_score": 7.8,
    "approval_rate": "80%",
    "approved_count": 4,
    "revision_needed_count": 1,
    "items_reviewed": 5
  }
}
```

**Storage**:
- Updates `outreach` records with `status='quality_approved'` or `status='revision_needed'`
- Creates `approvals` records for rejections
- Stores metrics in `agent_metrics` table

**Approval Required**: NO (this IS the pre-approval gate)

**Key Functions**:
- `run(context)` - Main execution function
- `reviewItem(item)` - Reviews individual content piece using Gemini
- `logAgentRun(runId, status, details)` - Logs execution

---

### Agent #29: Performance Manager

**File**: `/agents/manage/29-performance-manager.js`

**Role**: Chief Revenue Officer's analytics engine

**Responsibilities**:
- Monitor KPIs for all 26 worker agents + 2 peer managers
- Track: prospect volume, response rates, meeting conversion, pipeline velocity, content engagement, deal metrics
- Generate three report types: Daily Flash, Weekly Dashboard, Monthly Strategic
- A/B test underperforming variations
- Escalate when metrics drop >20% week-over-week

**Run Schedule**:
- Daily Flash: Every day
- Weekly Dashboard: Every Monday
- Monthly Strategic: First of each month

**KPI Thresholds**:
- LinkedIn accept rate: ≥15%
- Email open rate: ≥25%
- Response rate: ≥10%
- Meeting conversion rate: ≥15%
- Deal win rate: ≥20%

**Report Types**:

**1. Daily Flash** (2-minute read):
```json
{
  "report_type": "daily_flash",
  "headline": "...",
  "key_metrics": {
    "outreach_today": 0,
    "responses_today": 0,
    "meetings_scheduled": 0,
    "pipeline_value": "$0"
  },
  "critical_alerts": [],
  "performance_snapshot": "...",
  "next_actions": [],
  "summary": "..."
}
```

**2. Weekly Dashboard**:
```json
{
  "report_type": "weekly_dashboard",
  "week_ending": "...",
  "headline": "...",
  "kpi_summary": {
    "total_outreach": 0,
    "total_responses": 0,
    "response_rate": "X%",
    "meetings_scheduled": 0,
    "pipeline_value": "$0",
    "win_rate": "X%"
  },
  "channel_performance": {
    "linkedin": {"sent": 0, "response_rate": "X%", "trend": "↑↓→"},
    "email": {"sent": 0, "response_rate": "X%", "trend": "↑↓→"}
  },
  "agent_scores": {"agent_id": 0-100},
  "top_performers": [],
  "underperformers": [],
  "alerts": [],
  "recommendations": [],
  "summary": "..."
}
```

**3. Monthly Strategic**:
```json
{
  "report_type": "monthly_strategic",
  "month": "Month Year",
  "headline": "...",
  "executive_summary": "...",
  "trend_analysis": {
    "outreach_trend": "increasing|stable|decreasing",
    "response_rate_trend": "improving|stable|declining",
    "revenue_trend": "accelerating|stable|declining"
  },
  "strategic_insights": [],
  "recommended_pivots": [],
  "resource_allocation": {"allocate_to": [], "reduce": []},
  "market_opportunities": [],
  "risks": [],
  "30_day_goals": [],
  "summary": "..."
}
```

**Storage**:
- Metrics in `agent_metrics` table
- Comprehensive reports in `content` table

**Approval Required**: NO for reporting; YES for strategy changes

**Key Functions**:
- `run(context)` - Main execution with reportType parameter
- `fetchPerformanceData()` - Aggregates all performance data
- `calculateKPIs(outreach, pipeline, metrics, dateRanges)` - Computes key metrics
- `identifyAlerts(kpis)` - Flags concerning trends
- `generateDailyFlash(performanceData)` - Creates 2-minute summary
- `generateWeeklyDashboard(performanceData)` - Creates comprehensive review
- `generateMonthlyStrategic(performanceData)` - Creates strategic analysis

---

## CEO Dashboard

### File: `/dashboard/index.html`

**Purpose**: Single-page dashboard for CEO to monitor pipeline, agents, and approvals

**Technology Stack**:
- Vanilla JavaScript (no build tools)
- Chart.js (CDN-loaded) for visualizations
- Supabase JS client (CDN-loaded)
- Responsive CSS Grid

**Features**:

#### 1. Header Bar
- "DROOID COMMAND CENTER" title
- Live connection status indicator with pulsing dot
- Last refresh timestamp
- Manual refresh button

#### 2. KPI Row (5 Cards)
- **Active Leads**: Count of `leads` where `status='active'`
- **Pipeline Value**: Sum of `pipeline.deal_value` where stage not closed
- **Meetings This Week**: Count of `pipeline` where `stage='meeting'` in last 7 days
- **Response Rate**: Percentage of `outreach` with `response_at` / total sent
- **Pending Approvals**: Count of `approvals` where `status='pending'`

#### 3. Pipeline Kanban
- Horizontal columns for each stage: Lead → Qualified → Meeting → Proposal → Negotiation → Closed Won
- Each deal card shows:
  - Company name
  - Deal value
  - Days in stage (with color-coded health: green <3d, amber 3-7d, red >7d)
  - Contact name

#### 4. Agent Health Grid
- 29 agent cards in responsive grid (4-5 per row on desktop)
- Each card shows:
  - Agent status dot (green=healthy, amber=degraded, red=failed)
  - Agent name and ID
  - API calls count
  - Tokens used
  - Last run time

#### 5. Approval Queue
- List of pending approvals with:
  - Approval type (quality_revision, content_approval, etc.)
  - Content preview (100 chars)
  - Originating agent
  - Approve/Reject buttons (calls `/api/approve/:id` and `/api/reject/:id`)

#### 6. Activity Feed
- Last 50 agent_logs entries in reverse chronological order
- Filter by agent name (real-time)
- Filter by status (success/error/pending)
- Shows: timestamp, agent name, summary, status

#### 7. Analytics Charts (Chart.js)
- **Pipeline Funnel**: Bar chart showing deal count per stage
- **Daily Outreach Volume**: Line chart of last 30 days
- **Response Rates by Channel**: Bar chart comparing LinkedIn vs Email vs Phone

**Configuration**:

At the top of `index.html`:
```javascript
const SUPABASE_URL = 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

Replace with your actual Supabase credentials.

**Auto-Refresh**: Every 60 seconds

**Styling**:
- Drooid brand colors: #0F1117 bg, #4338CA indigo, #0D9488 teal, #10B981 green
- System font stack for performance
- Fully responsive (mobile-friendly)
- Smooth transitions and hover effects

---

### File: `/dashboard/server.js`

**Purpose**: Express server to serve the dashboard and handle approval actions

**Endpoints**:

#### GET `/`
Serves the dashboard HTML file

#### GET `/health`
Returns server health status:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-22T10:30:00Z",
  "uptime": 1234.5
}
```

#### POST `/api/approve/:id`
Approves a pending item:
- Updates `approvals` record with `status='approved'`
- If quality approval, updates `outreach` to `status='approved'`
- Returns approved record

Request body: (optional) none required

Response:
```json
{
  "success": true,
  "message": "Item approved",
  "approval": {...}
}
```

#### POST `/api/reject/:id`
Rejects a pending item:
- Updates `approvals` record with `status='rejected'`
- Stores rejection reason
- Updates `outreach` to `status='revision_needed'`
- Returns rejected record

Request body:
```json
{
  "reason": "Needs more personalization"
}
```

Response:
```json
{
  "success": true,
  "message": "Item rejected",
  "approval": {...}
}
```

**Configuration**:

Port: Configurable via `PORT` env var (default 3000)
```bash
PORT=8080 node server.js
```

**Features**:
- Request logging (method, path, status, duration)
- Error handling middleware
- Graceful shutdown on SIGTERM/SIGINT
- Unhandled promise rejection handler
- Input validation
- Supabase integration

---

## Database Schema Requirements

These tables must exist in Supabase:

### `agent_logs`
```sql
- id: uuid
- agent_id: string
- agent_name: string
- run_id: string
- status: string (success|error|pending)
- details: jsonb
- created_at: timestamp
```

### `agent_metrics`
```sql
- id: uuid
- agent_id: string
- agent_name: string
- run_id: string
- metrics: jsonb
- execution_time_ms: integer
- tokens_used: integer
- api_calls: integer
- status: string
- created_at: timestamp
```

### `pipeline`
```sql
- id: uuid
- company_name: string
- contact_name: string
- deal_value: decimal
- stage: string (lead|qualified|meeting|proposal|negotiation|closed_won|closed_lost)
- created_at: timestamp
- updated_at: timestamp
- closed_at: timestamp (nullable)
```

### `leads`
```sql
- id: uuid
- status: string (active|inactive|converted|cold)
- created_at: timestamp
```

### `outreach`
```sql
- id: uuid
- agent_id: string
- prospect_name: string
- company_name: string
- channel: string (linkedin|email|phone)
- content_type: string
- content: text
- status: string (draft|quality_approved|revision_needed|approved|sent)
- approved: boolean
- approved_at: timestamp
- quality_score: integer
- quality_feedback: text
- quality_reviewer: string
- sent_at: timestamp
- response_at: timestamp
- opened_at: timestamp
- clicked_at: timestamp
- created_at: timestamp
```

### `approvals`
```sql
- id: uuid
- type: string (quality_revision|content_approval|etc)
- item_id: uuid
- agent_id: string
- status: string (pending|approved|rejected)
- content: jsonb
- rejection_reason: text
- approved_at: timestamp
- rejected_at: timestamp
- created_at: timestamp
```

### `content`
```sql
- id: uuid
- type: string
- title: string
- content: text
- status: string
- created_by: string
- created_at: timestamp
```

---

## Running the System

### 1. Install Dependencies

```bash
npm install express
npm install @supabase/supabase-js
```

### 2. Configure Environment

Create `.env` file:
```
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key
PORT=3000
```

### 3. Start Dashboard Server

```bash
cd dashboard
node server.js
```

Server will be available at `http://localhost:3000`

### 4. Schedule Agent Runs

Use your scheduler (cron, Task Scheduler, etc.) to trigger:

**Pipeline Manager** (every 4 hours):
```bash
node agents/manage/27-pipeline-manager.js
```

**Quality Manager** (every 2 hours):
```bash
node agents/manage/28-quality-manager.js
```

**Performance Manager** (daily/weekly/monthly):
```bash
# Daily flash
node -e "require('./agents/manage/29-performance-manager.js').run({reportType: 'daily'})"

# Weekly dashboard (Mondays)
node -e "require('./agents/manage/29-performance-manager.js').run({reportType: 'weekly'})"

# Monthly strategic (1st of month)
node -e "require('./agents/manage/29-performance-manager.js').run({reportType: 'monthly'})"
```

---

## Integration with Worker Agents

Each management agent integrates with the worker agents through:

1. **Agent Logs**: All worker agents log their runs to `agent_logs` table
2. **Agent Metrics**: Worker agents store performance metrics
3. **Shared Database**: All agents use the same Supabase instance
4. **Approval Chain**: Quality Manager → CEO Dashboard → Worker Agents

Worker agents check the `approvals` table before executing actions that require CEO approval.

---

## Error Handling

All agents implement comprehensive error handling:
- Try/catch blocks around all async operations
- Graceful fallbacks when Gemini parsing fails
- Detailed error logging to `agent_logs`
- Status escalation to CEO when critical errors occur

The dashboard shows:
- Error states in activity feed
- Agent health degradation on failed runs
- Error messages in header

---

## Performance Considerations

### Token Usage
- Pipeline Manager: ~500-1000 tokens per run
- Quality Manager: ~100-200 tokens per item
- Performance Manager: ~1500-2500 tokens per run

### Database Queries
- Minimal indexes recommended on: `created_at`, `status`, `agent_id`
- Archival recommended for logs older than 30 days

### Dashboard Load
- Auto-refresh every 60 seconds
- Parallel loading of all sections
- Charts use Canvas (efficient rendering)
- Activity feed limited to 50 items

---

## Security Notes

1. **Supabase Anon Key**: Use Row-Level Security (RLS) policies
2. **API Endpoints**: Validate all input IDs
3. **Sensitive Data**: Don't log prospect contact information
4. **Environment Variables**: Use `.env` file, never commit keys

---

## Future Enhancements

1. Real-time updates using Supabase Realtime
2. Custom alerts via Slack/email
3. Agent performance comparison
4. A/B testing dashboard
5. Custom report builder
6. Multi-user access control
7. Audit log for all approvals/rejections

---

## Support

For issues or questions, refer to:
- Gemini 2.5 Flash documentation
- Supabase client library docs
- Express.js documentation
- Chart.js docs
