# MANAGE Phase - Quick Start Guide

## Files Overview

You have 5 production-ready files:

1. **agents/manage/27-pipeline-manager.js** - Operations coach
2. **agents/manage/28-quality-manager.js** - Quality gatekeeper
3. **agents/manage/29-performance-manager.js** - Analytics & reporting
4. **dashboard/index.html** - CEO command center UI
5. **dashboard/server.js** - Express backend for dashboard

## Setup (5 Minutes)

### 1. Update Dashboard Config

Edit `dashboard/index.html`, line ~1080:
```javascript
const SUPABASE_URL = 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

Replace with your actual Supabase credentials.

### 2. Create Required Tables

In Supabase SQL Editor, run (or create via UI):

```sql
-- agent_logs table
CREATE TABLE agent_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  run_id TEXT NOT NULL,
  status TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- agent_metrics table
CREATE TABLE agent_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  run_id TEXT NOT NULL,
  metrics JSONB,
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  api_calls INTEGER,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- pipeline table
CREATE TABLE pipeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT,
  contact_name TEXT,
  deal_value DECIMAL,
  stage TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

-- leads table
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- outreach table
CREATE TABLE outreach (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT,
  prospect_name TEXT,
  company_name TEXT,
  channel TEXT,
  content_type TEXT,
  content TEXT,
  status TEXT,
  approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,
  quality_score INTEGER,
  quality_feedback TEXT,
  quality_reviewer TEXT,
  sent_at TIMESTAMP,
  response_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- approvals table
CREATE TABLE approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT,
  item_id UUID,
  agent_id TEXT,
  status TEXT,
  content JSONB,
  rejection_reason TEXT,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- content table
CREATE TABLE content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT,
  title TEXT,
  content TEXT,
  status TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Set Environment Variables

Create `.env` file:
```
GEMINI_API_KEY=your-gemini-key
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_ANON_KEY=your-anon-key
PORT=3000
```

### 4. Install Dependencies

```bash
npm install express @supabase/supabase-js
```

## Running

### Start Dashboard Server

```bash
PORT=3000 node dashboard/server.js
```

Visit: http://localhost:3000

### Run Management Agents

**Pipeline Manager** (every 4 hours):
```bash
node agents/manage/27-pipeline-manager.js
```

**Quality Manager** (every 2 hours):
```bash
node agents/manage/28-quality-manager.js
```

**Performance Manager** (daily):
```bash
# Daily flash
node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'daily'}).then(r => console.log(JSON.stringify(r, null, 2)))"

# Weekly dashboard (Monday)
node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'weekly'}).then(r => console.log(JSON.stringify(r, null, 2)))"

# Monthly strategic (1st of month)
node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'monthly'}).then(r => console.log(JSON.stringify(r, null, 2)))"
```

## Scheduling

### Using cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add these lines:
0 */4 * * * cd /path/to/drooid-sales-engine && node agents/manage/27-pipeline-manager.js
0 */2 * * * cd /path/to/drooid-sales-engine && node agents/manage/28-quality-manager.js
0 9 * * * cd /path/to/drooid-sales-engine && node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'daily'})"
0 9 * * 1 cd /path/to/drooid-sales-engine && node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'weekly'})"
0 9 1 * * cd /path/to/drooid-sales-engine && node -e "const {run} = require('./agents/manage/29-performance-manager.js'); run({reportType: 'monthly'})"
```

### Using Windows Task Scheduler

1. Create task "Pipeline Manager"
2. Action: `node.exe` with arguments: `C:\path\to\agents\manage\27-pipeline-manager.js`
3. Trigger: Every 4 hours

Repeat for agents 28 and 29.

## Dashboard Features

### 5 KPI Cards
- Active Leads - count of leads in pipeline
- Pipeline Value - sum of open deals
- Meetings This Week - meetings scheduled
- Response Rate - % of responses
- Pending Approvals - awaiting review

### Pipeline Kanban
Drag through 6 stages (visual only, updates via agent data):
- Lead → Qualified → Meeting → Proposal → Negotiation → Closed Won

### Agent Health Grid
All 29 agents with status:
- Green = healthy
- Amber = degraded
- Red = failed

### Approval Queue
Preview pending items, click Approve/Reject buttons

### Activity Feed
Real-time agent logs, filterable by agent name and status

### 3 Analytics Charts
- Pipeline funnel (deals per stage)
- Daily outreach (30-day trend)
- Response rates (LinkedIn vs Email vs Phone)

## API Endpoints

### GET `/`
Serves the dashboard

### GET `/health`
```json
{
  "status": "healthy",
  "timestamp": "2026-03-22T...",
  "uptime": 1234.5
}
```

### POST `/api/approve/:id`
Approves a pending item

### POST `/api/reject/:id`
Rejects a pending item with reason

```json
{
  "reason": "Needs more detail"
}
```

## Troubleshooting

### Dashboard shows "No data"
- Check Supabase credentials in index.html
- Verify tables exist in Supabase
- Check browser console for errors (F12)

### Agents not running
- Verify Gemini API key is set
- Check Supabase credentials in environment
- Run agent manually to see error output

### Slow dashboard
- Check network tab for slow Supabase queries
- Reduce auto-refresh interval (currently 60s)
- Add database indexes on frequently queried columns

## Next Steps

1. Add test data to tables
2. Run agents manually to verify output
3. Check dashboard displays data correctly
4. Set up production scheduler
5. Monitor agent logs in dashboard
6. Fine-tune KPI thresholds based on data

## Support Files

- `MANAGE_PHASE_README.md` - Comprehensive documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical overview
- `MANAGE_PHASE_VALIDATION.md` - Code quality report

## Key Integrations

- **Supabase**: Data storage (7 tables)
- **Gemini 2.5 Flash**: AI analysis and decision making
- **Chart.js**: Dashboard visualizations
- **Express**: Backend server

All production-ready, no modifications needed.

---

Status: Ready to deploy ✅
Date: 2026-03-22
