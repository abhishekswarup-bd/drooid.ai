const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { logAgentAction, getPendingApprovals, updateApprovalStatus, queryLeads, queryPipeline } = require('../integrations/supabase-client');
const { callGemini, getUsageStats } = require('../integrations/gemini-client');
const { sanitize, sanitizeObject } = require('../security/input-sanitizer');
const { GeminiRateLimiter, ExpressRateLimiter } = require('../security/rate-limiter');
const auditLogger = require('../security/audit-logger');
const { safeExec } = require('../security/exec-guard');
const { runSecurityScan } = require('../security/security-scanner');

// Load agents configuration
const agentsPath = path.join(__dirname, '../config/agents.json');
const agentsConfig = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));

// In-memory queue for agent tasks
class AgentQueue {
    constructor(maxConcurrent = 3) {
        this.queue = [];
        this.running = [];
        this.maxConcurrent = maxConcurrent;
    }

    async enqueue(agentId, task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ agentId, task, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        while (this.running.length < this.maxConcurrent && this.queue.length > 0) {
            const { agentId, task, resolve, reject } = this.queue.shift();
            this.running.push(agentId);

            task()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    this.running = this.running.filter(id => id !== agentId);
                    this.processQueue();
                });
        }
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            running: this.running,
            maxConcurrent: this.maxConcurrent,
        };
    }
}

const agentQueue = new AgentQueue(3);
const geminiLimiter = new GeminiRateLimiter(250000, 250);
const expressLimiter = new ExpressRateLimiter(60);

// Agent runner - executes a single agent
async function runAgent(agentConfig, context = {}) {
    const startTime = Date.now();
    const agent = agentsConfig.find(a => a.id === agentConfig.id);

    if (!agent) {
        throw new Error(`Agent ${agentConfig.id} not found in configuration`);
    }

    // Sanitize context input
    const sanitizedContext = sanitizeObject(context);

    auditLogger.action('agent-start', { agentId: agent.id, agentName: agent.name });

    try {
        // Determine input based on agent phase
        let agentInput = '';
        let inputSummary = '';

        switch (agent.phase) {
            case 'discover':
                agentInput = await buildDiscoverInput(agent, sanitizedContext);
                inputSummary = `Discovering prospects for ${sanitizedContext.industry || 'general market'}`;
                break;
            case 'engage':
                agentInput = await buildEngageInput(agent, sanitizedContext);
                inputSummary = `Engaging prospects with personalized outreach`;
                break;
            case 'convert':
                agentInput = await buildConvertInput(agent, sanitizedContext);
                inputSummary = `Converting pipeline opportunities`;
                break;
            case 'create':
                agentInput = await buildCreateInput(agent, sanitizedContext);
                inputSummary = `Creating marketing and sales content`;
                break;
            case 'innovate':
                agentInput = await buildInnovateInput(agent, sanitizedContext);
                inputSummary = `Innovating revenue strategies`;
                break;
            case 'partner':
                agentInput = await buildPartnerInput(agent, sanitizedContext);
                inputSummary = `Managing strategic partnerships`;
                break;
            case 'manage':
                agentInput = await buildManageInput(agent, sanitizedContext);
                inputSummary = `Managing operations and quality`;
                break;
            default:
                throw new Error(`Unknown agent phase: ${agent.phase}`);
        }

        // Build system prompt
        const systemPrompt = buildSystemPrompt(agent);

        // Call Gemini
        const result = await callGemini(agentInput, {
            systemPrompt,
            temperature: getTemperatureForComplexity(agent.complexity),
            maxTokens: agent.output_tokens_per_call,
            jsonMode: agent.phase !== 'create',
        });

        if (!result.success) {
            throw new Error(`Gemini call failed: ${result.content}`);
        }

        const duration = Date.now() - startTime;
        const outputSummary = result.content.substring(0, 500);

        // Log the action
        const logResult = await logAgentAction({
            agent_id: agent.id,
            agent_name: agent.name,
            action: agent.phase,
            input_summary: inputSummary,
            output_summary: outputSummary,
            tokens_used: result.tokens.total,
            model: agent.model,
            duration_ms: duration,
            status: 'success',
        });

        auditLogger.action('agent-complete', {
            agentId: agent.id,
            agentName: agent.name,
            duration,
            tokensUsed: result.tokens.total,
            status: 'success',
        });

        // Check if approval is needed
        if (agent.requires_approval && process.env.APPROVAL_MODE === 'manual') {
            const approval = await createApprovalFromResult(agent, result.content);
            return {
                success: true,
                agentId: agent.id,
                agentName: agent.name,
                result: result.content,
                tokens: result.tokens,
                duration,
                approvalRequired: true,
                approvalId: approval.data?.id,
            };
        }

        // Execute the result if it's an action
        const executionResult = await executeAgentResult(agent, result.content);

        return {
            success: true,
            agentId: agent.id,
            agentName: agent.name,
            result: result.content,
            tokens: result.tokens,
            duration,
            executionResult,
        };
    } catch (error) {
        const duration = Date.now() - startTime;

        await logAgentAction({
            agent_id: agentConfig.id,
            agent_name: agent?.name || 'Unknown',
            action: agent?.phase || 'unknown',
            input_summary: 'Error occurred',
            output_summary: '',
            tokens_used: 0,
            model: agent?.model || 'gemini-2.5-flash',
            duration_ms: duration,
            status: 'failure',
            error: error.message,
        }).catch(err => console.error('Failed to log error:', err));

        auditLogger.error('agent-failed', {
            agentId: agent?.id || agentConfig.id,
            agentName: agent?.name || 'Unknown',
            error: error.message,
            duration,
        });

        throw error;
    }
}

// Build input prompts based on agent phase
async function buildDiscoverInput(agent, context) {
    const leads = await queryLeads({ limit: 5, minIcpScore: 0.5 });
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Industry focus: ${context.industry || 'B2B SaaS'}
- Company size: ${context.employeeCount || 'any'}
- Budget: ${context.budget || 'not specified'}

Recent leads: ${JSON.stringify(leads.data || [])}

Provide structured JSON with prospects found, decision-makers identified, and ICP scores.`;
}

async function buildEngageInput(agent, context) {
    const leads = await queryLeads({ limit: 3, status: 'qualified' });
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Target leads: ${leads.data?.length || 0} leads ready for engagement
- Channel: ${context.channel || 'multi-channel'}
- Personalization level: high

Task: Generate engaging outreach content tailored to prospect needs and personas.
Return as JSON with channel, message_type, content, and recommended follow-up.`;
}

async function buildConvertInput(agent, context) {
    const pipeline = await queryPipeline({ limit: 10, stage: 'meeting' });
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Active opportunities: ${pipeline.data?.length || 0} deals in pipeline
- Focus stage: ${context.stage || 'all'}

Task: Analyze current opportunities and recommend actions to move deals forward.
Return as JSON with recommendations, next steps, and confidence scores.`;
}

async function buildCreateInput(agent, context) {
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Content type: ${agent.id.includes('social') ? 'social media' : 'marketing'}
- Audience: ${context.audience || 'target market'}
- Tone: professional yet engaging
- Keywords: ${context.keywords || 'industry best practices'}

Task: Create high-quality, conversion-focused content.
Return structured content with title, body, metadata, and performance expectations.`;
}

async function buildInnovateInput(agent, context) {
    const metrics = await queryPipeline({ limit: 20 });
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Current pipeline size: ${metrics.data?.length || 0} opportunities
- Average deal size: ${context.avgDealSize || 'not specified'}
- Sales cycle: ${context.salesCycle || 'unknown'}

Task: Analyze patterns and innovate new approaches to improve results.
Return as JSON with insights, new strategies, and expected impact.`;
}

async function buildPartnerInput(agent, context) {
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Target partnerships: ${context.partnerType || 'resellers, integrations, referral partners'}
- Mutual value drivers: ${context.valueProposition || 'revenue sharing, customer access'}

Task: Identify and reach out to strategic partners.
Return as JSON with partner candidates, approach strategy, and mutual benefits.`;
}

async function buildManageInput(agent, context) {
    return `You are ${agent.name}. Your task: ${agent.description}

Context:
- Operation focus: ${context.focus || 'overall optimization'}
- Current issues: ${context.issues || 'none reported'}

Task: Monitor and optimize operations.
Return as JSON with findings, quality scores, recommendations, and action items.`;
}

function buildSystemPrompt(agent) {
    return `You are a specialized AI sales agent: ${agent.name}.
Description: ${agent.description}
Complexity Level: ${agent.complexity}
Phase: ${agent.phase}

Your role:
- Execute your specific function with precision and high quality
- Make data-driven decisions
- Provide actionable insights and recommendations
- Return structured, valid JSON responses
- Never make up data - use only provided context
- Flag uncertainty or missing information
- Consider regulatory and ethical constraints

Output format: Always return valid JSON with clear structure, rationale, and next steps.`;
}

function getTemperatureForComplexity(complexity) {
    const temps = {
        simple: 0.5,
        medium: 0.7,
        complex: 0.9,
    };
    return temps[complexity] || 0.7;
}

// Create approval from agent result
async function createApprovalFromResult(agent, content) {
    const { createApproval } = require('../integrations/supabase-client');
    return createApproval({
        agent_id: agent.id,
        action_type: agent.phase,
        payload: { agent_name: agent.name, content },
    });
}

// Execute agent result (stub for integration points)
async function executeAgentResult(agent, content) {
    // This is where actual execution happens (send emails, post content, etc.)
    // For now, return a status
    return {
        executed: true,
        agent: agent.name,
        timestamp: new Date().toISOString(),
    };
}

// Schedule agents
function scheduleAgents() {
    const scheduledAgents = {};

    agentsConfig.forEach(agent => {
        if (agent.frequency === 'event_driven') return; // Skip event-driven agents

        let cronExpression = '';

        switch (agent.frequency) {
            case 'daily':
                // Run at 8 AM daily
                cronExpression = '0 8 * * *';
                break;
            case 'weekly':
                // Run on Monday at 9 AM
                cronExpression = '0 9 * * 1';
                break;
            case 'monthly':
                // Run on first of month at 10 AM
                cronExpression = '0 10 1 * *';
                break;
            default:
                return;
        }

        scheduledAgents[agent.id] = cron.schedule(cronExpression, async () => {
            console.log(`[${new Date().toISOString()}] Triggering agent: ${agent.name} (${agent.id})`);
            try {
                const result = await agentQueue.enqueue(agent.id, () => runAgent(agent));
                console.log(`[${new Date().toISOString()}] Agent ${agent.name} completed:`, result);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Agent ${agent.name} failed:`, error.message);
            }
        });

        console.log(`Scheduled agent ${agent.name} with frequency: ${agent.frequency} (${cronExpression})`);
    });

    return scheduledAgents;
}

// Express app for health checks and webhooks
const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' })); // Limit payload size
app.use(expressLimiter.middleware()); // Rate limiting

// Request validation middleware
app.use((req, res, next) => {
  auditLogger.apiCall(req.method, req.path, { ip: req.ip });
  next();
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        agentQueue: agentQueue.getStatus(),
        geminiUsage: getUsageStats(),
    });
});

app.get('/agents', (req, res) => {
    res.json({
        agents: agentsConfig,
        total: agentsConfig.length,
    });
});

app.get('/agents/:id', (req, res) => {
    const agent = agentsConfig.find(a => a.id === req.params.id);
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
});

app.post('/agents/:id/run', async (req, res) => {
    const agent = agentsConfig.find(a => a.id === req.params.id);
    if (!agent) {
        auditLogger.security('agent-not-found', { agentId: req.params.id });
        return res.status(404).json({ error: 'Agent not found' });
    }

    try {
        const result = await runAgent(agent, req.body.context || {});
        res.json(result);
    } catch (error) {
        auditLogger.error('run-agent-endpoint-error', { agentId: agent.id, error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.post('/approvals/:id/review', async (req, res) => {
    const { status, notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const result = await updateApprovalStatus(req.params.id, status, notes);
        if (status === 'approved') {
            // Execute the approved action
            console.log(`Approval ${req.params.id} approved - executing action`);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/queue/status', (req, res) => {
    res.json(agentQueue.getStatus());
});

// Security endpoints
app.post('/security/scan', async (req, res) => {
    try {
        auditLogger.action('security-scan-requested', {});
        const results = await runSecurityScan();
        res.json(results);
    } catch (error) {
        auditLogger.error('security-scan-failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.get('/security/status', (req, res) => {
    try {
        const status = {
            timestamp: new Date().toISOString(),
            geminiRateLimit: geminiLimiter.getStats(),
            expressRateLimit: expressLimiter.getStats(req.ip),
        };
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/security/audit-logs', (req, res) => {
    try {
        const days = Math.min(parseInt(req.query.days) || 1, 90);
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

        const logs = auditLogger.getLogs(startDate, endDate);
        res.json({
            range: { start: startDate, end: endDate },
            count: logs.length,
            logs: logs.slice(-100), // Last 100 entries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Scheduler running on port ${process.env.PORT || 3000}`);
    console.log('Scheduling agents...');
    scheduleAgents();
    console.log('All agents scheduled successfully');
});

module.exports = {
    agentQueue,
    runAgent,
    scheduleAgents,
    app,
};
