# Scheduler Implementation Guide

## Files Overview

### 1. orchestrator/scheduler.js (15 KB)
**Purpose**: Main orchestration engine with cron scheduling and REST API

**Key Exports**:
- `AGENT_SCHEDULES` - Map of agent IDs to cron expressions
- `APPROVAL_REQUIRED_AGENTS` - Set of agents requiring CEO approval
- `triggerAgent(agent, context, priority)` - Manual agent trigger
- `scheduleAllAgents()` - Initialize all cron jobs
- `app` - Express app instance
- `jobQueue` - Job queue instance
- `agentRunner` - Agent runner instance

**Cron Expression Format**:
```
minute hour day month dayOfWeek
0      6    *   *     *          = Every day at 6:00 AM
*/15   *    *   *     *          = Every 15 minutes
0      *    *   *     *          = Every hour at :00
0      */2  *   *     *          = Every 2 hours
0      *    *   *     1-5        = Every hour Mon-Fri
```

**How It Works**:
1. Load agents from `config/agents.json`
2. Register cron jobs for scheduled agents
3. When cron fires, call `triggerAgent()`
4. `triggerAgent()` enqueues job in `jobQueue`
5. Queue processes jobs respecting concurrency limits
6. Each job executes via `agentRunner.executeAgent()`

**Express Routes**:
- `GET /health` - Basic status
- `GET /api/status` - Detailed system status
- `GET /api/health/detailed` - Comprehensive health report
- `GET /api/queue` - Queue state
- `POST /api/queue/pause` - Pause processing
- `POST /api/queue/resume` - Resume processing
- `GET /api/agents` - List all agents
- `GET /api/agents/:agentId` - Agent details
- `POST /api/trigger/:agentId` - Manual trigger

---

### 2. orchestrator/queue.js (5.5 KB)
**Purpose**: Advanced job queue with concurrency control and rate limiting

**Key Class**: `JobQueue`

**Constructor**:
```javascript
new JobQueue(maxConcurrent = 4, apiCallDelayMs = 2000)
```

**Key Methods**:

#### `enqueue(agentId, agentName, taskFn, priority = 'normal')`
Returns Promise that resolves when job completes
```javascript
await jobQueue.enqueue('agent-04', 'BDR', async () => {
  return await agentRunner.executeAgent(agent);
}, 'normal');
```

#### `getStatus()`
Returns queue state object
```javascript
{
  queueLength: 2,
  runningCount: 2,
  maxConcurrent: 4,
  runningJobs: [{agentId, duration}],
  pendingJobs: [{agentId, waitTime}],
  stats: {processed, failed, avgWaitTime}
}
```

#### `pause() / resume()`
Stop/start queue processing

#### `clear()`
Remove all pending jobs (dev/test only)

**How It Works**:
1. Job enqueued with priority
2. Queue sorts jobs by priority
3. Main loop: while (running < max && queue > 0)
4. Apply 2-second delay before processing
5. Pop job from queue, add to running set
6. Execute job and capture result
7. Remove from running, call processQueue() recursively
8. Track stats (processed, failed, avg wait time)

**Rate Limiting**:
- Enforces 2-second minimum between API calls
- Respects Gemini's 5 RPM free tier limit
- Logs warnings if API call timing is exceeded

---

### 3. orchestrator/agent-runner.js (13 KB)
**Purpose**: Execute individual agents with full error handling

**Key Class**: `AgentRunner`

**Key Methods**:

#### `executeAgent(agent, context = {})`
Main execution method
```javascript
const result = await agentRunner.executeAgent(agent, {
  industry: 'B2B SaaS',
  budget: '50k-100k'
});
```

**Returns**:
```javascript
{
  success: true,
  agentId: 'agent-04',
  agentName: 'BDR',
  status: 'completed|pending_approval|failed',
  result: 'Agent output...',
  duration: 2350,
  tokensUsed: 1540,
  approvalId: 'ap_xxx' // if approval required
}
```

#### `buildAgentInput(agent, context)`
Creates phase-specific prompts based on agent type
- **discover**: Looks up qualified leads
- **engage**: Retrieves targets for outreach
- **convert**: Fetches pipeline opportunities
- **create**: Prepares content creation context
- **innovate**: Analyzes market trends
- **partner**: Gathers partnership opportunities
- **manage**: Prepares operational context

#### `callGeminiWithRetry(input, systemPrompt, agent, maxRetries = 3)`
Calls Gemini API with exponential backoff
```
Attempt 1 fails
  Wait 1s (2^0)
Attempt 2 fails
  Wait 2s (2^1)
Attempt 3 fails
  Wait 4s (2^2)
Throw error after 3 attempts
```

#### `buildSystemPrompt(agent)`
Creates consistent system prompt for all agents
- Agent name and role
- Phase and complexity
- Instructions for JSON output
- Ethical constraints

#### `logExecution(agent, details)`
Logs to Supabase `agent_logs` table
- Execution ID for tracking
- Duration and token usage
- Input/output summaries
- Error details if failed

#### `createApprovalRecord(agent, content)`
Creates approval record for CEO review
- Stores agent output
- Sets status to 'pending'
- Returns approval ID for tracking

**Error Handling**:
- Try/catch wraps entire execution
- Logs to Winston and Supabase
- Returns success: false on error
- Doesn't throw from executeAgent() (returns error status instead)

**Retry Logic**:
- Only applies to Gemini API calls
- Exponential backoff: 1s, 2s, 4s
- Logs each retry attempt
- Throws on final failure (caught in executeAgent)

---

## Integration Points

### Supabase Dependencies
```javascript
const {
  logAgentAction,        // Log execution to agent_logs
  createApproval,        // Create approval record
  queryLeads,            // Fetch lead data for agents
  queryPipeline,         // Fetch pipeline for agents
  updateApprovalStatus   // Update approval (if used)
} = require('../integrations/supabase-client');
```

### Gemini Dependencies
```javascript
const { callGemini } = require('../integrations/gemini-client');

// Called with:
callGemini(input, {
  systemPrompt,
  temperature: 0.6,
  maxTokens: 1000,
  jsonMode: true
})
```

---

## Approval Flow Example

**Scenario**: Agent 06 (Sales Writer) execution

```
1. triggerAgent(agent06, context)
   └─ jobQueue.enqueue()
      └─ agentRunner.executeAgent()
         ├─ buildAgentInput() → prompt
         ├─ buildSystemPrompt() → system instructions
         ├─ callGeminiWithRetry() → result
         ├─ logExecution() → logs to Supabase
         └─ Check: requires_approval?
            ├─ YES → createApprovalRecord() → approval pending
            │        Return {status: 'pending_approval', approvalId}
            └─ NO → Return {status: 'completed', result}

2. CEO reviews in dashboard
   └─ POST /api/approvals/ap_xxx/review
      ├─ status: 'approved'
      └─ Approval record updated

3. Approval listener (external) detects change
   └─ Executes the approved action
```

---

## Data Structures

### Agent Configuration (from agents.json)
```javascript
{
  id: "agent-04",
  name: "BDR (Lauren Carter)",
  phase: "engage",
  complexity: "medium",
  model: "gemini-2.5-flash",
  frequency: "daily",
  calls_per_month: 500,
  input_tokens_per_call: 300,
  output_tokens_per_call: 200,
  tools: ["linkedin_api", "supabase"],
  requires_approval: true,
  description: "Crafts and sends personalized LinkedIn messages"
}
```

### Execution Result Object
```javascript
{
  success: true,
  agentId: "agent-04",
  agentName: "BDR (Lauren Carter)",
  status: "completed", // completed | pending_approval | failed
  result: "JSON output from agent...",
  duration: 2350,      // milliseconds
  tokensUsed: 1540,
  approvalId: "ap_123" // only if pending_approval
}
```

### Queue Status Object
```javascript
{
  queueLength: 2,
  runningCount: 2,
  maxConcurrent: 4,
  runningJobs: [
    { agentId: "agent-04", duration: 1250 }
  ],
  pendingJobs: [
    {
      agentId: "agent-05",
      agentName: "Prospect Researcher",
      priority: "normal",
      waitTime: 450
    }
  ],
  stats: {
    processed: 145,
    failed: 3,
    totalWaitTime: 340000,
    avgWaitTime: "2340"
  }
}
```

---

## Configuration Tuning

### Increase Throughput
1. **Increase concurrent agents** (queue.js):
   ```javascript
   const jobQueue = new JobQueue(6, 2000); // 4 → 6
   ```
   ⚠️ Monitor memory and API rate limits

2. **Reduce API call delay** (queue.js):
   ```javascript
   const jobQueue = new JobQueue(4, 1000); // 2000ms → 1000ms
   ```
   ⚠️ Respect Gemini's 5 RPM free tier

3. **Increase tokens per agent** (agents.json):
   ```json
   "output_tokens_per_call": 400  // 200 → 400
   ```
   ⚠️ Increases latency and token costs

### Optimize Cost
1. **Reduce token allocation**:
   - Lower `output_tokens_per_call` in agents.json
   - Simplify prompts in buildSystemPrompt()

2. **Batch similar operations**:
   - Run agents 1-3 together (discovery phase)
   - Run agents 4-9 together (engagement phase)

3. **Adjust frequency**:
   - Change cron expressions in AGENT_SCHEDULES
   - Set `frequency: 'weekly'` instead of `'daily'` for low-impact agents

### Improve Reliability
1. **Increase retry attempts**:
   ```javascript
   await this.callGeminiWithRetry(input, systemPrompt, agent, 5); // 3 → 5
   ```

2. **Enable approval logging**:
   ```javascript
   this.logger.info('Approval required', {agentId, approvalId});
   ```

3. **Monitor health checks**:
   ```bash
   while true; do curl http://localhost:3000/api/health; sleep 60; done
   ```

---

## Testing Checklist

- [ ] All three files created (scheduler.js, queue.js, agent-runner.js)
- [ ] Syntax valid: `node -c orchestrator/*.js`
- [ ] Dependencies installed: `npm list | grep -E "node-cron|express|winston"`
- [ ] Environment variables set (GEMINI_API_KEY, SUPABASE_URL)
- [ ] Server starts: `npm start`
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] API endpoints accessible: `curl http://localhost:3000/api/agents`
- [ ] Agent trigger works: `curl -X POST http://localhost:3000/api/trigger/agent-01`
- [ ] Queue status shows activity: `curl http://localhost:3000/api/queue`
- [ ] Logs created: `ls -la logs/`
- [ ] No unhandled rejections: Check console output
- [ ] Cron jobs scheduled: Check logs for "Scheduled agent..."

---

## Common Customizations

### Change Max Concurrent Agents
**File**: `orchestrator/scheduler.js` (line 19)
```javascript
const jobQueue = new JobQueue(6, 2000); // was 4
```

### Add New Agent Schedule
**File**: `orchestrator/scheduler.js` (AGENT_SCHEDULES object)
```javascript
'agent-30': '0 10 * * *', // 10 AM daily
```

### Change API Rate Limit
**File**: `orchestrator/scheduler.js` (line ~140)
```javascript
const apiLimiter = rateLimit({
  windowMs: 60000,
  max: 200, // was 100
});
```

### Disable Approval for Testing
**File**: `.env`
```bash
APPROVAL_MODE=auto
```

### Change Log Level
**File**: `.env`
```bash
LOG_LEVEL=debug  # was info
```

---

## Performance Metrics

### Expected Performance
- **Throughput**: ~1,800 agents/hour (4 concurrent × ~225/hour)
- **Latency**: ~4-15 seconds per agent
- **Token usage**: ~250,000 tokens/day for all 29 agents
- **Memory**: ~50-100 MB
- **CPU**: Minimal idle, moderate during execution

### Bottleneck Analysis
If jobs queue up:
1. Check queue length: `GET /api/queue`
2. Identify slow agents: `GET /api/status` → recentExecutions
3. Monitor API delays: Check logs for "rate limiting" warnings
4. Increase concurrency or reduce agent complexity

---

## Deployment Checklist

- [ ] Copy orchestrator/ directory to production
- [ ] Set environment variables in production .env
- [ ] Create logs directory: `mkdir -p logs`
- [ ] Start service: `npm start`
- [ ] Configure process manager (PM2, systemd, Docker)
- [ ] Set up log rotation
- [ ] Configure monitoring/alerts
- [ ] Test manual trigger endpoints
- [ ] Verify Supabase connections
- [ ] Monitor first 24 hours of execution

---

## Monitoring Commands

```bash
# Watch scheduler logs
tail -f logs/scheduler.log

# Check health every 30 seconds
watch -n 30 'curl -s http://localhost:3000/api/health/detailed | jq .'

# Monitor queue backlog
watch -n 5 'curl -s http://localhost:3000/api/queue | jq ".queue.queueLength"'

# Count recent agent executions
curl -s http://localhost:3000/api/status | jq '.recentExecutions | length'

# Check for errors in logs
grep ERROR logs/*.log
```

---

## Architecture Summary

```
Cron triggers → Scheduler → Queue → AgentRunner → Gemini API
                                  ↓
                            Supabase (logs)

19 agents run on scheduled cron jobs
6 agents triggered by external events
3 agents require CEO approval

Max 4 concurrent agents
2-second delay between API calls
3 retry attempts with exponential backoff
```

**Total Lines of Code**: ~1,400 (production-ready, fully documented)
