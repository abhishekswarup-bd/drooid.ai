// Wraps child_process.exec with safety checks
// Whitelist of allowed commands, blocks shell metacharacters, enforces timeouts

const { execSync } = require('child_process');
const path = require('path');
const auditLogger = require('./audit-logger');

const ALLOWED_PREFIXES = [
  'node tools/supabase-tool.js',
  'node tools/sendgrid-tool.js',
  'node tools/hunter-tool.js',
  'node tools/security-scanner.js',
  'node tools/key-rotation.js',
  'npm audit',
];

const BLOCKED_CHARS = /[;&|`$(){}]/;
const BLOCKED_COMMANDS = /\b(curl|wget|nc|ncat|ssh|scp|rsync|dd|mkfs|chmod\s+777|eval|rm\s+-rf)\b/i;

function safeExec(command, options = {}) {
  // Validate input
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string');
  }

  const trimmedCommand = command.trim();

  // Check against whitelist
  const isAllowed = ALLOWED_PREFIXES.some(prefix =>
    trimmedCommand.startsWith(prefix)
  );

  if (!isAllowed) {
    auditLogger.security('exec-blocked', {
      command: trimmedCommand.substring(0, 100),
      reason: 'Not in whitelist',
      agentId: options.agentId,
    });
    throw new Error(`Command not allowed: ${trimmedCommand.substring(0, 50)}`);
  }

  // Check for shell injection characters
  if (BLOCKED_CHARS.test(trimmedCommand)) {
    auditLogger.security('exec-injection', {
      command: trimmedCommand.substring(0, 100),
      reason: 'Shell metacharacters detected',
      agentId: options.agentId,
    });
    throw new Error('Command contains blocked characters');
  }

  // Check for dangerous commands
  if (BLOCKED_COMMANDS.test(trimmedCommand)) {
    auditLogger.security('exec-dangerous', {
      command: trimmedCommand.substring(0, 100),
      reason: 'Dangerous command pattern',
      agentId: options.agentId,
    });
    throw new Error('Command matches blocked pattern');
  }

  const timeout = Math.min(options.timeout || 30000, 30000); // max 30s

  auditLogger.action('exec', {
    command: trimmedCommand.substring(0, 100),
    agentId: options.agentId,
    timeout,
  });

  try {
    const result = execSync(trimmedCommand, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024, // 1MB max output
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const sanitizedOutput = sanitizeOutput(result);

    auditLogger.action('exec-success', {
      command: trimmedCommand.substring(0, 100),
      agentId: options.agentId,
      outputLength: sanitizedOutput.length,
    });

    return sanitizedOutput;
  } catch (error) {
    auditLogger.error('exec-failed', {
      command: trimmedCommand.substring(0, 100),
      agentId: options.agentId,
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

// Sanitize command output to remove sensitive data
function sanitizeOutput(output) {
  if (!output || typeof output !== 'string') return '';

  let sanitized = output;

  // Remove common sensitive patterns
  sanitized = sanitized.replace(/api[_-]?key\s*[:=]\s*\S+/gi, 'api_key=[REDACTED]');
  sanitized = sanitized.replace(/password\s*[:=]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/secret\s*[:=]\s*\S+/gi, 'secret=[REDACTED]');
  sanitized = sanitized.replace(/token\s*[:=]\s*\S+/gi, 'token=[REDACTED]');

  return sanitized;
}

module.exports = { safeExec, sanitizeOutput };
