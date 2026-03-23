const express = require('express');
const path = require('path');
const db = require('../../integrations/supabase-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Approve endpoint
app.post('/api/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status
    const { data, error } = await db
      .from('approvals')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
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

    // If this was a content approval, update the outreach/content status
    const approval = data[0];
    if (approval.item_id && approval.type === 'quality_approved') {
      await db
        .from('outreach')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          status: 'approved'
        })
        .eq('id', approval.item_id);
    }

    res.json({
      success: true,
      message: 'Item approved',
      approval: approval
    });

  } catch (error) {
    console.error('Error approving item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject endpoint
app.post('/api/reject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Validate ID format
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid approval ID' });
    }

    // Update approval status
    const { data, error } = await db
      .from('approvals')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
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

    const approval = data[0];

    // If this was a content approval, send back for revision
    if (approval.item_id) {
      await db
        .from('outreach')
        .update({
          status: 'revision_needed',
          approved: false,
          revision_feedback: reason || 'Rejected by CEO - please revise'
        })
        .eq('id', approval.item_id);
    }

    res.json({
      success: true,
      message: 'Item rejected',
      approval: approval
    });

  } catch (error) {
    console.error('Error rejecting item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`DROOID Command Center running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
