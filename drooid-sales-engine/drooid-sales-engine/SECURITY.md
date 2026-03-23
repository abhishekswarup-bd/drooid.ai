# DROOID Sales Engine - Security Hardening Guide

This document outlines the security features implemented in the Node.js orchestrator and how to use them.

## Table of Contents
1. [Input Sanitization](#input-sanitization)
2. [Rate Limiting](#rate-limiting)
3. [Audit Logging](#audit-logging)
4. [Command Execution Guards](#command-execution-guards)
5. [Security Scanning](#security-scanning)
6. [Key Rotation](#key-rotation)
7. [Docker Hardening](#docker-hardening)
8. [Best Practices](#best-practices)

## Input Sanitization

All external text inputs are sanitized before reaching agent prompts to defend against prompt injection attacks.

### Protected Inputs
- Prospect data (names, emails, companies, notes)
- Web scraping results
- Email content
- User-provided context data

### Injection Patterns Blocked
- Direct instruction overrides ("ignore previous instructions")
- System role overrides ("you are now...")
- Hidden instructions (zero-width characters)
- Base64 encoded commands
- Markdown/HTML injection attempts
- Suspicious phrases ("act as", "jailbreak", "admin mode", etc.)

### Usage
```javascript
const { sanitize, sanitizeObject } = require('./security/input-sanitizer');

// Sanitize single string
const { text, sanitized, flags } = sanitize(userInput);

// Sanitize object with multiple fields
const cleanData = sanitizeObject({
  name: userInput.name,
  email: userInput.email,
  notes: userInput.notes
});
```

## Rate Limiting

Token bucket rate limiter for both Gemini API calls and Express endpoints.

### Gemini API Rate Limits
- **Per Minute**: 250,000 tokens
- **Per Day**: 250 requests
- **Queue**: Automatic queuing for excess requests

### Express Endpoint Rate Limits
- **Per IP**: 60 requests per minute
- **Auto-blocking**: Temporary block after threshold

### Checking Status
```bash
# Get current rate limit status
curl http://localhost:3000/security/status

# Expected response:
{
  "geminiRateLimit": {
    "tokensRemaining": 249500,
    "requestsToday": 10,
    "maxRequestsPerDay": 250
  },
  "expressRateLimit": {
    "ip": "127.0.0.1",
    "requestsInWindow": 5,
    "blocked": false
  }
}
```

## Audit Logging

Comprehensive audit trail logging to both local files and Supabase.

### Log Categories
- **action**: Agent execution, tasks, operations
- **api**: API calls (Gemini, Supabase)
- **data**: Database operations (INSERT, UPDATE, DELETE)
- **approval**: Approval decisions and reviews
- **security**: Security events, injection attempts, anomalies
- **auth**: Authentication attempts
- **error**: Error events and exceptions

### Log Files
- Location: `./logs/audit-YYYY-MM-DD.log`
- Format: JSON (one entry per line)
- Rotation: Daily
- Retention: 90 days (auto-cleanup)

### Viewing Logs
```bash
# Get last 100 log entries from past 7 days
curl "http://localhost:3000/security/audit-logs?days=7"

# View specific log file
tail -f logs/audit-2026-03-22.log

# Query by type
cat logs/audit-*.log | grep '"type":"security"'
```

## Command Execution Guards

Safe execution wrapper for child_process with whitelist validation.

### Allowed Commands
- `node tools/supabase-tool.js`
- `node tools/sendgrid-tool.js`
- `node tools/hunter-tool.js`
- `node tools/security-scanner.js`
- `node tools/key-rotation.js`
- `npm audit`

### Blocked Patterns
- Shell metacharacters: `;`, `|`, `&`, `` ` ``, `$()`, `{}`
- Dangerous commands: `curl`, `wget`, `ssh`, `rm -rf`, `chmod 777`, `eval`

### Usage
```javascript
const { safeExec } = require('./security/exec-guard');

// Safe execution with whitelist validation
try {
  const result = safeExec('node tools/security-scanner.js', {
    agentId: 'agent-123',
    timeout: 30000
  });
  console.log(result);
} catch (error) {
  console.error('Command not allowed:', error.message);
}
```

## Security Scanning

Automated daily security scanner checks system health.

### Checks Performed
1. **npm audit**: Vulnerability scanning
2. **.env permissions**: Validates file is 600 (owner read/write only)
3. **API key age**: Tracks and alerts on old keys
4. **Port exposure**: Checks for public port exposure
5. **Dependency versions**: Detects outdated packages

### Running Scan
```bash
# Trigger security scan
curl -X POST http://localhost:3000/security/scan

# Expected response:
{
  "timestamp": "2026-03-22T10:30:00Z",
  "severity": "warning",
  "checks": [
    {
      "name": "npm-audit",
      "status": "pass",
      "critical": 0,
      "high": 0
    },
    {
      "name": "env-permissions",
      "status": "pass",
      "currentMode": "600"
    },
    ...
  ]
}
```

## Key Rotation

API key rotation tracking and reminder system.

### Initialize Tracking
```bash
# In Node REPL
const keyRotation = require('./security/key-rotation');
keyRotation.init(); // Records current dates
```

### Check Key Ages
```bash
# Get status of all keys
const status = keyRotation.check();
// Returns array with age of each key

// Get formatted report
const report = keyRotation.report();
console.log(report);
```

### Mark Key as Rotated
```bash
keyRotation.rotated('gemini_api_key');
keyRotation.rotated('supabase_service_key');
```

### Get Rotation Reminders
```bash
const reminder = keyRotation.remind();
// Logs keys needing rotation (>25 days old)
// Alerts on expired keys (>30 days old)
```

## Docker Hardening

Hardened Docker container with security best practices.

### Security Features
- Non-root user (nodejs:nodejs, UID 1001)
- Read-only rootfs (where possible)
- No new privileges flag
- All Linux capabilities dropped
- Memory limits (512MB)
- CPU limits (1 core)
- Healthcheck enabled
- Tini process manager for signal handling
- JSON logging with rotation

### Building Image
```bash
docker build -t drooid-sales-engine:latest .
```

### Running with Docker Compose
```bash
# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Start service
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f

# Run security scan
curl http://localhost:3000/security/scan

# Stop service
docker-compose down
```

### Security Configuration
```yaml
# docker-compose.yml features:
- Localhost-only port binding (127.0.0.1:3000)
- Memory limit: 512MB
- CPU limit: 1 core
- No new privileges: true
- Capabilities dropped: ALL
- Logging: JSON with rotation (10MB max per file, 3 files)
- Health check: HTTP /health endpoint
```

## Best Practices

### 1. Environment Variables
```bash
# Set proper permissions on .env
chmod 600 .env

# Never commit .env to version control
echo ".env" >> .gitignore

# Use .env.example as template
cp .env.example .env
```

### 2. Regular Security Scans
```bash
# Run weekly
curl -X POST http://localhost:3000/security/scan

# Monitor logs
tail -f logs/audit-*.log | grep '"type":"security"'
```

### 3. Key Rotation Schedule
- Check key ages: Weekly
- Rotate keys: Every 25 days
- Alert threshold: 25 days old
- Expiry: 30 days old (CRITICAL)

### 4. Audit Log Review
```bash
# Daily review
tail logs/audit-$(date +%Y-%m-%d).log

# Security events only
grep '"type":"security"' logs/audit-*.log

# Failed operations
grep '"type":"error"' logs/audit-*.log
```

### 5. Rate Limit Monitoring
```bash
# Check if approaching limits
curl http://localhost:3000/security/status | jq '.geminiRateLimit'

# Monitor for blocked IPs
grep '"type":"security".*rate-limit' logs/audit-*.log
```

### 6. Input Validation Checklist
When adding new data sources, ensure:
- ✓ Text inputs are sanitized
- ✓ Email addresses validated
- ✓ URLs validated
- ✓ Length limits enforced
- ✓ Suspicious patterns blocked

### 7. Incident Response
If security event detected:
1. Check logs: `grep -i "security\|error" logs/audit-*.log`
2. Review recent API calls
3. Check rate limit status
4. Verify key rotation status
5. Run security scan: `curl -X POST http://localhost:3000/security/scan`
6. Review Gemini/Supabase logs
7. Document in incident tracking

## Compliance

This hardening implements:
- **OWASP Top 10**: Input validation, injection defense, rate limiting
- **CWE**: Prompt injection, command injection, sensitive data exposure
- **NIST**: Access controls, logging, encryption in transit (HTTPS recommended)

## Additional Resources

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [CWE-400: Uncontrolled Resource Consumption](https://cwe.mitre.org/data/definitions/400.html)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

Last Updated: 2026-03-22
Maintained by: Security Team
