# Scheduler Quick Start

## 30-Second Setup

```bash
# 1. Verify dependencies installed
npm list | grep -E "node-cron|express|winston"

# 2. Verify .env has required variables (should already be there)
grep GEMINI_API_KEY .env
grep SUPABASE_URL .env

# 3. Start scheduler
npm start
```

## Verify It's Working

```bash
# In another terminal:

# Check health
curl http://localhost:3000/health

# List all agents
curl http://localhost:3000/api/agents | jq '.total'

# Check queue (should be empty initially)
curl http://localhost:3000/api/queue | jq '.queue.queueLength'
```

## Test Manual Trigger

```bash
# Trigger agent 01 (Market Intelligence)
curl -X POST http://localhost:3000/api/trigger/agent-01 \
  -H "Content-Type: application/json" \
  -d '{}'

# Check queue processing
curl http://localhost:3000/api/queue | jq '.'
```

## Monitor Live

```bash
# Watch logs
tail -f logs/scheduler.log

# In another terminal, check status every 5 seconds
watch -n 5 'curl -s http://localhost:3000/api/health/detailed | jq ".health.queue"'
```

## Stop Scheduler

```bash
# Press Ctrl+C in the terminal where scheduler is running
# Or kill the process:
pkill -f "node orchestrator/scheduler.js"
```

---

## What Happens at Startup

```
[√] Load 29 agents from config/agents.json
[√] Initialize job queue (max 4 concurrent)
[√] Initialize agent runner
[√] Schedule 23 agents with cron expressions
[√] Start Express API on port 3000
[√] Create logs/ directory
[√] Ready to process agents!
```

## Expected Cron Schedules

```
06:00 AM daily      - Agents 01-03 (DISCOVER)
Hourly 8am-6pm      - Agent 04 (BDR)
Every 2 hours       - Agent 05 (Prospect Researcher)
Every 3 hours 8-6pm - Agent 09 (Multi-channel)
Every 4 hours 8-6pm - Agent 08 (Follow-up)
Every 15 minutes    - Agent 27 (CEO Dashboard)
Midnight daily      - Agent 29 (Compliance)
+ 15 more agents with their own schedules
```

## Common Tasks

### Trigger High-Priority Agent
```bash
curl -X POST http://localhost:3000/api/trigger/agent-04 \
  -H "Content-Type: application/json" \
  -d '{"priority": "high"}'
```

### Pause Queue (Stop Processing)
```bash
curl -X POST http://localhost:3000/api/queue/pause
```

### Resume Queue
```bash
curl -X POST http://localhost:3000/api/queue/resume
```

### Check Agent Status
```bash
curl http://localhost:3000/api/agents/agent-06 | jq '.'
```

### View Recent Executions
```bash
curl http://localhost:3000/api/status | jq '.recentExecutions'
```

### Check Queue Backlog
```bash
curl http://localhost:3000/api/queue | jq '.queue.pendingJobs'
```

---

## Troubleshooting

### "Port 3000 already in use"
```bash
# Find and kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### "Cannot find module 'winston'"
```bash
# Install dependencies
npm install
```

### "Agent not found"
```bash
# Check agent IDs
curl http://localhost:3000/api/agents | jq '.agents[].id'
```

### Queue is stuck
```bash
# Check if scheduler is paused
curl http://localhost:3000/api/queue | jq '.queue'

# If paused, resume
curl -X POST http://localhost:3000/api/queue/resume
```

### No logs appearing
```bash
# Check if logs directory exists
ls -la logs/

# Check log level
echo $LOG_LEVEL

# Set to debug
LOG_LEVEL=debug npm start
```

---

## File Locations

```
orchestrator/
├── scheduler.js (555 lines) - Main orchestrator
├── queue.js (218 lines) - Job queue
└── agent-runner.js (408 lines) - Agent execution

config/
└── agents.json - Agent configuration

logs/ (created at runtime)
├── scheduler.log
├── queue.log
└── agents.log

Documentation:
├── SCHEDULER_DOCUMENTATION.md (500+ lines)
├── SCHEDULER_IMPLEMENTATION_GUIDE.md (400+ lines)
└── SCHEDULER_QUICKSTART.md (this file)
```

---

## Next Steps

1. **Read** `SCHEDULER_DOCUMENTATION.md` for complete API docs
2. **Review** `SCHEDULER_IMPLEMENTATION_GUIDE.md` for architecture details
3. **Monitor** logs: `tail -f logs/scheduler.log`
4. **Test** with manual triggers via API
5. **Observe** cron schedules execute at their times

---

## API Endpoints Cheat Sheet

```bash
# Health
GET /health
GET /api/health/detailed

# Status
GET /api/status
GET /api/queue

# Agents
GET /api/agents
GET /api/agents/:agentId
POST /api/trigger/:agentId

# Queue Control
POST /api/queue/pause
POST /api/queue/resume
```

---

## Performance Metrics to Watch

After ~1 hour of operation, check:

```bash
# System health
curl http://localhost:3000/api/health/detailed | jq '.health'

# Queue stats
curl http://localhost:3000/api/queue | jq '.queue.stats'

# Execution count (should be > 0)
curl http://localhost:3000/api/status | jq '.recentExecutions | length'
```

Expected after 1 hour:
- `processed`: 4-8 agents (depending on schedules)
- `failed`: 0-1 (some may fail first time)
- `avgWaitTime`: < 5000ms

---

## Log Examples

### Successful Agent Run
```
[scheduler] Agent execution started: Market Intelligence Scanner (agent-01)
[queue] Job started: agent-01 (Market Intelligence Scanner)
[agents] Agent execution completed: Market Intelligence Scanner
[queue] Job completed: agent-01 (Market Intelligence Scanner) - duration: 2350ms
```

### Failed Agent (Retry)
```
[agents] Gemini API call failed (attempt 1/3), retrying in 1000ms
[agents] Gemini API call failed (attempt 2/3), retrying in 2000ms
[agents] Job failed: agent-04 - Gemini API error after 3 retries
```

### Approval-Gated Agent
```
[agents] Agent requires approval: Sales Writer (agent-06)
[agents] Approval record created for Sales Writer - approvalId: ap_123
[scheduler] Job completed: agent-06 - status: pending_approval
```

---

## Environment Variables Quick Reference

```bash
# Already in your .env:
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=ey...
APPROVAL_MODE=manual

# Optional tuning:
LOG_LEVEL=info           # debug|info|warn|error
NODE_ENV=production      # production|development
PORT=3000               # Change if needed
```

---

Done! Your scheduler is ready to go. Questions? See `SCHEDULER_DOCUMENTATION.md`.
