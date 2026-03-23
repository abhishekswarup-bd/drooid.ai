const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

const JobQueue = require('./queue');
const AgentRunner = require('./agent-runner');
const OpenClawHandler = require('../integrations/openclaw-handler');

// Load agents configuration
const agentsPath = path.join(__dirname, '../config/agents.json');
const agentsConfig = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));

// Initialize queue and agent runner
const jobQueue = new JobQueue(4, 2000); // Max 4 concurrent, 2s delay
const agentRunner = new AgentRunner();

// Create Winston logger for scheduler
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/scheduler.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Schedule definition for all 30 agents
 * Format: agentId -> cron expression or null for event-driven
 */
const AGENT_SCHEDULES = {
  // CEO phase (strategic C-level outreach)
  'agent-00': '0 9 * * 1-5', // CEO Agent Abi - daily 9am weekdays (C-level outreach with coaching & QA)

  // DISCOVER phase (6am daily)
  'agent-01': '0 6 * * *', // Market Intelligence Scanner
  'agent-02': '0 6 * * *', // ICP Researcher - weekly deep analysis (runs same time as 01)
  'agent-03': '0 6 * * *', // Tech Stack Analyst - weekly monitoring

  // ENGAGE phase (throughout business hours)
  'agent-04': '0 * * * *', // BDR - hourly during business hours (8am-6pm)
  'agent-05': '0 */2 * * *', // Prospect Researcher - every 2 hours
  'agent-06': null, // Sales Writer - triggered after new qualified leads
  'agent-07': null, // Objection Handler - on-demand/event-triggered
  'agent-08': '0 8,12,16 * * *', // Follow-up Sequencer - 8am, 12pm, 4pm
  'agent-09': '0 9,12,15,18 * * *', // Multi-channel Orchestrator - every 3 hours (9am-6pm)

  // CONVERT phase (business hours)
  'agent-10': '0 */2 * * *', // Demo Scheduler - every 2 hours
  'agent-11': null, // Proposal Generator - triggered on deal stage change
  'agent-12': null, // ROI Calculator - on-demand
  'agent-13': null, // Negotiation Analyst - on-demand
  'agent-14': null, // Contract Prep - triggered on proposal accepted
  'agent-15': '0 7 * * *', // Competitor Intel - daily at 7am
  'agent-16': '0 9 * * 1', // Win/Loss Analyst - weekly Monday at 9am
  'agent-17': '0 9 * * *', // Customer Success - daily at 9am

  // CREATE phase (off-peak hours)
  'agent-18': '0 5 * * 2,4', // Thought Leadership - Tue/Thu at 5am
  'agent-19': '0 5 * * 3', // Case Study Writer - Wednesday at 5am
  'agent-20': '0 7 * * * \n 0 14 * * *', // Social Media - 7am and 2pm daily
  'agent-21': '0 5 * * 5', // Website Publisher - Friday at 5am
  'agent-22': '0 5 * * 1,3', // Events & Community - Mon/Wed at 5am
  'agent-30': '0 6 * * 1', // Content Strategist - Monday at 6am (weekly strategy planning)

  // INNOVATE phase (weekly)
  'agent-23': '0 8 * * 5', // Product Feedback Synthesizer - Friday at 8am
  'agent-24': '0 8 * * 1', // Market Trends - Monday at 8am
  'agent-25': '0 7 * * 1,3', // Brand & Comms - Mon/Wed at 7am

  // PARTNER phase (weekly)
  'agent-26': '0 8 * * 3', // Strategic Partnerships - Wednesday at 8am

  // MANAGE phase (continuous/daily)
  'agent-27': '*/15 * * * *', // CEO Dashboard Agent - every 15 minutes
  'agent-28': '0 */6 * * *', // Performance Optimizer - every 6 hours
  'agent-29': '0 0 * * *', // Compliance Monitor - daily at midnight
};

/**
 * Approval-required agents (must wait for CEO approval)
 */
const APPROVAL_REQUIRED_AGENTS = new Set([
  'agent-00', // CEO Agent Abi - all C-level outreach requires CEO approval
  'agent-06', // Sales Writer
  'agent-11', // Proposal Generator
  'agent-14', // Contract Prep
  'agent-30', // Content Strategist - strategy should be CEO-approved
]);

/**
 * Track last execution time for each agent
 */
const executionHistory = new Map();

/**
 * Schedule all agents based on configuration
 */
function scheduleAllAgents() {
  const scheduledJobs = new Map();

  logger.info('Initializing agent scheduler...');

  agentsConfig.forEach((agent) => {
    const cronExpression = AGENT_SCHEDULES[agent.id];

    // Skip event-driven agents
    if (!cronExpression) {
      logger.info(`Agent ${agent.id} (${agent.name}) is event-driven, not scheduled`);
      return;
    }

    // Handle agents with multiple schedules (e.g., agent-20)
    const schedules = cronExpression.split('\n').map((s) => s.trim()).filter((s) => s);

    schedules.forEach((schedule, index) => {
      try {
        const job = cron.schedule(schedule, () => triggerAgent(agent), {
          scheduled: true,
        });

        const jobKey = index > 0 ? `${agent.id}-${index}` : agent.id;
        scheduledJobs.set(jobKey, {
          job,
          agentId: agent.id,
          agentName: agent.name,
          cronExpression: schedule,
          scheduledAt: new Date().toISOString(),
        });

        logger.info(`Scheduled: ${agent.name} (${agent.id}) | Cron: ${schedule}`);
      } catch (error) {
        logger.error(`Failed to schedule agent ${agent.id}`, {
          agentId: agent.id,
          error: error.message,
        });
      }
    });
  });

  logger.info(`All agents scheduled. Total jobs: ${scheduledJobs.size}`);
  return scheduledJobs;
}

/**
 * Trigger an agent - enqueue it in the job queue
 */
async function triggerAgent(agent, context = {}, priority = 'normal') {
  const lastRun = executionHistory.get(agent.id);
  const now = Date.now();

  // Prevent duplicate runs within 30 seconds
  if (lastRun && now - lastRun < 30000) {
    logger.warn(`Skipping duplicate trigger for ${agent.id} within 30s`);
    return;
  }

  executionHistory.set(agent.id, now);

  try {
    // Check if approval is required and still pending
    if (APPROVAL_REQUIRED_AGENTS.has(agent.id) && process.env.APPROVAL_MODE === 'manual') {
      logger.info(`Agent ${agent.id} (${agent.name}) requires approval - will be gated`, {
        agentId: agent.id,
      });
    }

    // Enqueue the agent
    const result = await jobQueue.enqueue(
      agent.id,
      agent.name,
      () => agentRunner.executeAgent(agent, context),
      priority
    );

    logger.info(`Agent execution completed: ${agent.name}`, {
      agentId: agent.id,
      status: result.status,
      duration: result.duration,
    });

    return result;
  } catch (error) {
    logger.error(`Failed to execute agent ${agent.id}`, {
      agentId: agent.id,
      agentName: agent.name,
      error: error.message,
    });

    return {
      success: false,
      agentId: agent.id,
      agentName: agent.name,
      error: error.message,
    };
  }
}

/**
 * Express.js app setup
 */
const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP',
});

app.use('/api/', apiLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

/**
 * GET /health - Basic health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
  });
});

/**
 * GET /api/status - Detailed system status
 */
app.get('/api/status', (req, res) => {
  const queueStatus = jobQueue.getStatus();

  res.json({
    timestamp: new Date().toISOString(),
    scheduler: {
      status: 'running',
      agentsScheduled: agentsConfig.length,
      approvalMode: process.env.APPROVAL_MODE,
    },
    queue: queueStatus,
    recentExecutions: Array.from(executionHistory.entries())
      .map(([agentId, lastRun]) => ({
        agentId,
        lastRun: new Date(lastRun).toISOString(),
        secondsAgo: Math.round((Date.now() - lastRun) / 1000),
      }))
      .sort((a, b) => a.secondsAgo - b.secondsAgo)
      .slice(0, 10),
  });
});

/**
 * GET /api/queue - View current queue
 */
app.get('/api/queue', (req, res) => {
  const status = jobQueue.getStatus();
  res.json({
    timestamp: new Date().toISOString(),
    queue: status,
  });
});

/**
 * POST /api/trigger/:agentId - Manually trigger an agent
 */
app.post('/api/trigger/:agentId', async (req, res) => {
  const agentId = req.params.agentId;
  const agent = agentsConfig.find((a) => a.id === agentId);

  if (!agent) {
    return res.status(404).json({
      error: 'Agent not found',
      agentId,
    });
  }

  try {
    const context = req.body.context || {};
    const priority = req.body.priority || 'normal';

    logger.info(`Manual trigger requested for ${agent.name}`, {
      agentId,
      priority,
    });

    const result = await triggerAgent(agent, context, priority);

    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
      },
      trigger: {
        timestamp: new Date().toISOString(),
        priority,
      },
      result,
    });
  } catch (error) {
    logger.error(`Failed to trigger agent ${agentId}`, {
      agentId,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to trigger agent',
      agentId,
      message: error.message,
    });
  }
});

/**
 * GET /api/agents - List all agents with schedule info
 */
app.get('/api/agents', (req, res) => {
  const agents = agentsConfig.map((agent) => {
    const schedule = AGENT_SCHEDULES[agent.id];
    const lastRun = executionHistory.get(agent.id);

    return {
      id: agent.id,
      name: agent.name,
      phase: agent.phase,
      complexity: agent.complexity,
      frequency: agent.frequency,
      scheduled: !!schedule,
      cronExpression: schedule || 'event-driven',
      requiresApproval: APPROVAL_REQUIRED_AGENTS.has(agent.id),
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    };
  });

  res.json({
    timestamp: new Date().toISOString(),
    total: agents.length,
    agents,
  });
});

/**
 * GET /api/agents/:agentId - Get specific agent info
 */
app.get('/api/agents/:agentId', (req, res) => {
  const agent = agentsConfig.find((a) => a.id === req.params.agentId);

  if (!agent) {
    return res.status(404).json({
      error: 'Agent not found',
      agentId: req.params.agentId,
    });
  }

  const schedule = AGENT_SCHEDULES[agent.id];
  const lastRun = executionHistory.get(agent.id);

  res.json({
    timestamp: new Date().toISOString(),
    agent: {
      ...agent,
      scheduled: !!schedule,
      cronExpression: schedule || 'event-driven',
      requiresApproval: APPROVAL_REQUIRED_AGENTS.has(agent.id),
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    },
  });
});

/**
 * GET /api/health/detailed - Detailed health report
 */
app.get('/api/health/detailed', (req, res) => {
  const queueStatus = jobQueue.getStatus();
  const scheduledAgents = Object.keys(AGENT_SCHEDULES).filter((id) => AGENT_SCHEDULES[id]);

  res.json({
    timestamp: new Date().toISOString(),
    health: {
      scheduler: 'healthy',
      queue: {
        status: 'operational',
        concurrency: queueStatus.maxConcurrent,
        current: queueStatus.runningCount,
        waiting: queueStatus.queueLength,
      },
      agents: {
        total: agentsConfig.length,
        scheduled: scheduledAgents.length,
        eventDriven: agentsConfig.length - scheduledAgents.length,
        requireApproval: Array.from(APPROVAL_REQUIRED_AGENTS).length,
      },
    },
    stats: {
      jobsProcessed: queueStatus.stats.processed,
      jobsFailed: queueStatus.stats.failed,
      avgWaitTimeMs: queueStatus.stats.avgWaitTime,
    },
    recentActivity: Array.from(executionHistory.entries())
      .map(([agentId, timestamp]) => {
        const agent = agentsConfig.find((a) => a.id === agentId);
        return {
          agentId,
          agentName: agent?.name,
          lastRun: new Date(timestamp).toISOString(),
        };
      })
      .sort((a, b) => new Date(b.lastRun) - new Date(a.lastRun))
      .slice(0, 5),
  });
});

/**
 * POST /api/queue/pause - Pause the queue
 */
app.post('/api/queue/pause', (req, res) => {
  jobQueue.pause();
  logger.info('Queue paused via API');
  res.json({
    status: 'paused',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/queue/resume - Resume the queue
 */
app.post('/api/queue/resume', (req, res) => {
  jobQueue.resume();
  logger.info('Queue resumed via API');
  res.json({
    status: 'resumed',
    timestamp: new Date().toISOString(),
  });
});

/**
 * WhatsApp Integration (OpenClaw + Baileys - Secured)
 */

// Initialize Supabase client for WhatsApp handler
let supabaseClient = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
} catch (e) {
  logger.warn('Supabase client not available for WhatsApp handler');
}

const openclawHandler = new OpenClawHandler(
  agentsConfig,
  triggerAgent,
  agentRunner,
  jobQueue,
  executionHistory,
  supabaseClient
);

// Initialize OpenClaw WhatsApp connection
openclawHandler.initialize().then(function() {
  logger.info('OpenClaw WhatsApp handler initialized successfully');
}).catch(function(err) {
  logger.error('OpenClaw initialization failed - WhatsApp will be unavailable', { error: err.message });
});

// JSON body parser for WhatsApp API routes
app.use('/whatsapp', express.json());

/**
 * POST /whatsapp/webhook - Incoming WhatsApp messages via OpenClaw/Baileys
 */
app.post('/whatsapp/webhook', async function(req, res) {
  try {
    logger.info('WhatsApp message received', {
      from: req.body.from,
      body: (req.body.message || '').substring(0, 50),
    });

    var result = await openclawHandler.processMessage(req.body);
    res.json({ success: true, result: result });
  } catch (error) {
    logger.error('WhatsApp webhook error', { error: error.message });
    res.status(500).json({ error: 'Error processing message. Please try again.' });
  }
});

/**
 * GET /whatsapp/status - WhatsApp integration status
 */
app.get('/whatsapp/status', function(req, res) {
  res.json({
    status: openclawHandler.isConnected() ? 'connected' : 'disconnected',
    provider: 'openclaw-baileys',
    securityFeatures: ['aes-256-gcm-encryption', 'rate-limiting', 'phone-allowlist', 'input-sanitization'],
    ceoNumberConfigured: !!process.env.CEO_WHATSAPP_NUMBER,
    webhookUrl: '/whatsapp/webhook',
    activeConversations: openclawHandler.conversations ? openclawHandler.conversations.size : 0,
  });
});

/**
 * POST /whatsapp/notify - Send proactive notification to CEO
 */
app.post('/whatsapp/notify', async function(req, res) {
  var message = req.body.message;
  if (!message) {
    return res.status(400).json({ error: 'message field required' });
  }

  try {
    var result = await openclawHandler.sendNotification(message);
    res.json({ success: true, result: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /whatsapp/qr - Get QR code for WhatsApp Web authentication
 */
app.get('/whatsapp/qr', function(req, res) {
  var qrData = openclawHandler.getQRCode();
  if (qrData) {
    res.json({ qr: qrData, status: 'scan_required' });
  } else {
    res.json({ qr: null, status: openclawHandler.isConnected() ? 'connected' : 'not_initialized' });
  }
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  logger.error('Express error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

/**
 * Start the server
 */
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Scheduler server started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Approval mode: ${process.env.APPROVAL_MODE}`);

  // Schedule all agents
  const scheduledJobs = scheduleAllAgents();

  logger.info(`Scheduler initialized with ${scheduledJobs.size} scheduled jobs`);

  // Log sample schedules
  logger.info('Sample agent schedules:');
  logger.info('- Agent 01 (Market Intelligence): 6:00 AM daily');
  logger.info('- Agent 04 (BDR): Every hour 8am-6pm');
  logger.info('- Agent 27 (CEO Dashboard): Every 15 minutes');
  logger.info('- Agent 29 (Compliance Monitor): Midnight daily');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise,
  });
});

module.exports = {
  app,
  scheduleAllAgents,
  triggerAgent,
  jobQueue,
  agentRunner,
  openclawHandler,
  AGENT_SCHEDULES,
  APPROVAL_REQUIRED_AGENTS,
};
