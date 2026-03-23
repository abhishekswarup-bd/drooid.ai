// Comprehensive audit trail logging to both file and Supabase
// Logs: agent execution, API calls, data operations, approvals, security events

const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const LOG_DIR = path.join(__dirname, '../logs');
const RETENTION_DAYS = 90;

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Get today's log filename
function getTodayLogFile() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `audit-${date}.log`);
}

// Get log entries older than retention period
function getExpiredLogFiles() {
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('audit-'));
  return files.filter(file => {
    const filePath = path.join(LOG_DIR, file);
    const stat = fs.statSync(filePath);
    return now - stat.mtimeMs > retentionMs;
  });
}

// Clean up expired logs
function cleanupExpiredLogs() {
  const expired = getExpiredLogFiles();
  for (const file of expired) {
    const filePath = path.join(LOG_DIR, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`[AuditLogger] Deleted expired log: ${file}`);
    } catch (error) {
      console.error(`[AuditLogger] Failed to delete ${file}:`, error.message);
    }
  }
}

// Write to local file
function writeToFile(entry) {
  try {
    const logFile = getTodayLogFile();
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch (error) {
    console.error('[AuditLogger] File write error:', error.message);
  }
}

// Write to Supabase
async function writeToSupabase(entry) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    await supabase.from('audit_logs').insert([{
      event_type: entry.type,
      agent_id: entry.agentId || null,
      action: entry.action || null,
      details: JSON.stringify(entry),
      severity: entry.severity || 'info',
      timestamp: entry.timestamp,
    }]);
  } catch (error) {
    console.error('[AuditLogger] Supabase write error:', error.message);
  }
}

// Unified logging function
function log(entry) {
  const timestamp = new Date().toISOString();
  const fullEntry = {
    ...entry,
    timestamp,
    hostname: os.hostname(),
    pid: process.pid,
  };

  // Write to both file and Supabase
  writeToFile(fullEntry);
  writeToSupabase(fullEntry).catch(err => {
    console.error('[AuditLogger] Failed to log to Supabase:', err.message);
  });
}

// Log agent execution
function action(type, details = {}) {
  log({
    type: 'action',
    event: type,
    agentId: details.agentId,
    severity: 'info',
    ...details,
  });
}

// Log API calls
function apiCall(method, endpoint, details = {}) {
  log({
    type: 'api',
    method,
    endpoint,
    severity: 'info',
    ...details,
  });
}

// Log data operations
function dataOperation(operation, table, details = {}) {
  log({
    type: 'data',
    operation,
    table,
    severity: 'info',
    ...details,
  });
}

// Log approval decision
function approval(agentId, decision, details = {}) {
  log({
    type: 'approval',
    agentId,
    decision,
    severity: 'warning',
    ...details,
  });
}

// Log security events
function security(eventType, details = {}) {
  log({
    type: 'security',
    eventType,
    severity: 'warning',
    ...details,
  });
}

// Log errors
function error(eventType, details = {}) {
  log({
    type: 'error',
    eventType,
    severity: 'error',
    ...details,
  });
}

// Log authentication events
function auth(result, details = {}) {
  log({
    type: 'auth',
    result,
    severity: result === 'success' ? 'info' : 'warning',
    ...details,
  });
}

// Get logs for a date range
function getLogs(startDate, endDate) {
  const logs = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `audit-${dateStr}.log`);

    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          logs.push(JSON.parse(line));
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return logs;
}

// Initialize: start cleanup interval
setInterval(cleanupExpiredLogs, 24 * 60 * 60 * 1000); // Daily cleanup

module.exports = {
  action,
  apiCall,
  dataOperation,
  approval,
  security,
  error,
  auth,
  getLogs,
  getTodayLogFile,
  getExpiredLogFiles,
  cleanupExpiredLogs,
};
