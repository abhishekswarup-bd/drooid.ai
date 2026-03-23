const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
});
app.use(limiter);

// Stricter rate limiting for approval endpoints
const approvalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many approval requests'
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Supabase client with service role key for write operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE credentials in environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /
 * Serves the main dashboard HTML
 */
app.get('/', (req, res) => {
    try {
        const dashboardPath = path.join(__dirname, 'index.html');

        // Check if index.html exists, if not serve a basic version
        if (fs.existsSync(dashboardPath)) {
            res.sendFile(dashboardPath);
        } else {
            // Serve basic HTML with instructions
            res.send(getDefaultDashboard());
        }
    } catch (error) {
        console.error('Error serving dashboard:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Approve endpoint - RESTful API
app.post('/api/approvals/:id/approve', approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status to approved
    const { data, error } = await supabase
      .from('approvals')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: 'ceo_dashboard'
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(400).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Approval not found or already processed' });
    }

    console.log(`Approval ${id} approved by CEO Dashboard`);

    // Emit event for orchestrator to process
    if (global.eventEmitter) {
      global.eventEmitter.emit('approval_processed', {
        approvalId: id,
        status: 'approved',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Approval processed',
      data: data[0]
    });

  } catch (error) {
    console.error('Error approving action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject endpoint - RESTful API
app.post('/api/approvals/:id/reject', approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status to rejected
    const { data, error } = await supabase
      .from('approvals')
      .update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: 'ceo_dashboard'
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(400).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Approval not found or already processed' });
    }

    console.log(`Approval ${id} rejected by CEO Dashboard`);

    // Emit event for orchestrator to process
    if (global.eventEmitter) {
      global.eventEmitter.emit('approval_processed', {
        approvalId: id,
        status: 'rejected',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Approval rejected',
      data: data[0]
    });

  } catch (error) {
    console.error('Error rejecting action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy endpoints for backwards compatibility
app.post('/api/approve/:id', approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status
    const { data, error } = await supabase
      .from('approvals')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to approve item' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    res.json({
      success: true,
      message: 'Item approved',
      approval: data[0]
    });

  } catch (error) {
    console.error('Error approving item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reject/:id', approvalLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status
    const { data, error } = await supabase
      .from('approvals')
      .update({
        status: 'rejected',
        decided_at: new Date().toISOString(),
        rejection_reason: reason || 'Rejected by CEO'
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to reject item' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    res.json({
      success: true,
      message: 'Item rejected',
      approval: data[0]
    });

  } catch (error) {
    console.error('Error rejecting item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/metrics
 * Get dashboard metrics
 */
app.get('/api/metrics', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Get all metrics in parallel
        const [
            { count: totalLeads },
            { data: activePipeline },
            { data: outreachData },
            { data: agentLogs }
        ] = await Promise.all([
            supabase.from('leads').select('*', { count: 'exact', head: true }),
            supabase.from('pipeline').select('id').in('stage', ['qualified', 'engaged', 'proposal']),
            supabase.from('outreach').select('id').gte('sent_at', today + 'T00:00:00'),
            supabase.from('agent_logs').select('id').gte('created_at', today + 'T00:00:00')
        ]);

        res.json({
            totalLeads: totalLeads || 0,
            activePipeline: activePipeline?.length || 0,
            outreachSent: outreachData?.length || 0,
            agentActions: agentLogs?.length || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

/**
 * GET /api/agents
 * Get all agent status and metrics
 */
app.get('/api/agents', async (req, res) => {
    try {
        const { data: agentMetrics, error } = await supabase
            .from('agent_metrics')
            .select('agent_id, agent_name, metric_name, metric_value, period')
            .order('agent_name', { ascending: true });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // Group by agent
        const agents = {};
        agentMetrics?.forEach(metric => {
            if (!agents[metric.agent_name]) {
                agents[metric.agent_name] = {
                    id: metric.agent_id,
                    name: metric.agent_name,
                    metrics: {}
                };
            }
            agents[metric.agent_name].metrics[metric.metric_name] = metric.metric_value;
        });

        res.json(Object.values(agents));
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

/**
 * GET /api/pending-approvals
 * Get count of pending approvals
 */
app.get('/api/pending-approvals', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('approvals')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({ pendingCount: count || 0 });
    } catch (error) {
        console.error('Error fetching pending approvals:', error);
        res.status(500).json({ error: 'Failed to fetch approvals' });
    }
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║     Drooid CEO Command Center Dashboard            ║
║              Running on port ${PORT}               ║
║                                                    ║
║  Dashboard: http://localhost:${PORT}               ║
║  Health:    http://localhost:${PORT}/health       ║
╚════════════════════════════════════════════════════╝
  `);
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

/**
 * Unhandled promise rejection handler
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/**
 * Get default dashboard HTML
 * Used if index.html doesn't exist
 */
function getDefaultDashboard() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Drooid CEO Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a, #1a2847);
            color: #e0e7ff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 2rem;
        }
        .container {
            text-align: center;
            max-width: 600px;
        }
        .logo {
            font-size: 3.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #14b8a6, #6366f1);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: #e0e7ff;
        }
        .message {
            color: #a1afc9;
            font-size: 1.125rem;
            margin-bottom: 2rem;
            line-height: 1.6;
        }
        .dashboard-link {
            display: inline-block;
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #14b8a6, #0d9488);
            color: #0a0f1f;
            text-decoration: none;
            border-radius: 0.5rem;
            font-weight: 600;
            transition: transform 0.2s;
        }
        .dashboard-link:hover {
            transform: translateY(-2px);
        }
        .info {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(20, 184, 166, 0.1);
            border-left: 4px solid #14b8a6;
            border-radius: 0.5rem;
            text-align: left;
            font-size: 0.875rem;
            color: #a1afc9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Drooid</div>
        <h1>CEO Command Center</h1>
        <div class="message">
            <p>Dashboard server is running and ready to serve your analytics.</p>
            <p style="margin-top: 1rem;">The full interactive dashboard will load with real-time data from Supabase.</p>
        </div>
        <a href="/api/metrics" class="dashboard-link">View API Metrics</a>
        <div class="info">
            <strong>Server Status:</strong> ✓ Running<br>
            <strong>Port:</strong> ${PORT}<br>
            <strong>API Endpoints:</strong><br>
            - GET /api/metrics<br>
            - GET /api/agents<br>
            - GET /api/pending-approvals<br>
            - POST /api/approvals/:id/approve<br>
            - POST /api/approvals/:id/reject
        </div>
    </div>
</body>
</html>`;
}

module.exports = app;
