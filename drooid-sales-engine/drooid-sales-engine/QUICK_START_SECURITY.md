# Quick Start Security Guide

## Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
chmod 600 .env
# Edit .env with your credentials

# 3. Verify no vulnerabilities
npm audit

# 4. Build Docker image (optional)
docker build -t drooid-sales-engine:latest .

# 5. Start service
docker-compose up -d
```

## Verify Installation

```bash
# Check service health
curl http://localhost:3000/health

# Run security scan
curl -X POST http://localhost:3000/security/scan

# View audit logs
curl "http://localhost:3000/security/audit-logs?days=1"
```

## Common Operations

### Check Rate Limits
```bash
curl http://localhost:3000/security/status
```

### Initialize Key Rotation
```bash
node -e "require('./security/key-rotation').init()"
```

### Check Key Ages
```bash
node -e "console.log(require('./security/key-rotation').report())"
```

### Mark Key as Rotated
```bash
node -e "require('./security/key-rotation').rotated('gemini_api_key')"
```

### Get Rotation Reminders
```bash
node -e "require('./security/key-rotation').remind()"
```

### View Real-time Logs
```bash
tail -f logs/audit-$(date +%Y-%m-%d).log
```

### Filter Security Events Only
```bash
tail logs/audit-*.log | grep '"type":"security"'
```

## Emergency Procedures

### If Rate Limited
```bash
# Check current status
curl http://localhost:3000/security/status

# Rates reset automatically:
# - Per-minute: Resets every 60 seconds
# - Per-day: Resets daily at UTC midnight
```

### If Injection Attempt Detected
```bash
# Check logs for details
grep "injection" logs/audit-*.log

# Review the attack
grep -B5 -A5 "injection" logs/audit-*.log

# No action needed - attack was blocked
# Continue normal operations
```

### If API Keys Compromised
```bash
# Immediately rotate the key in your provider
# Then mark as rotated in tracking:
node -e "require('./security/key-rotation').rotated('gemini_api_key')"

# Update .env with new key
nano .env  # or your editor

# Restart service
docker-compose restart
```

## Deployment Checklist

```
PRE-DEPLOYMENT
[ ] npm install
[ ] npm audit (no CRITICAL or HIGH vulnerabilities)
[ ] cp .env.example .env
[ ] chmod 600 .env
[ ] Fill in GEMINI_API_KEY and Supabase credentials
[ ] mkdir -p logs

DOCKER BUILD
[ ] docker build -t drooid-sales-engine:latest .
[ ] docker images | grep drooid

STARTUP
[ ] docker-compose up -d
[ ] docker ps | grep drooid-sales-engine
[ ] curl http://localhost:3000/health

VERIFICATION
[ ] curl -X POST http://localhost:3000/security/scan
[ ] Check logs exist: ls -la logs/audit-*.log
[ ] Initialize key rotation: node -e "require('./security/key-rotation').init()"

MONITORING
[ ] Setup log monitoring: tail -f logs/audit-$(date +%Y-%m-%d).log
[ ] Set calendar reminder: Weekly security scan
[ ] Set calendar reminder: Monthly key rotation check
```

## Security Endpoints Reference

```
GET  /health                    # Health check
GET  /agents                    # List agents
GET  /agents/:id                # Agent details
POST /agents/:id/run            # Run agent
GET  /queue/status              # Queue status

SECURITY ENDPOINTS
POST /security/scan             # Trigger security scan
GET  /security/status           # Rate limit status
GET  /security/audit-logs?days=N # Audit logs

APPROVAL ENDPOINTS
POST /approvals/:id/review      # Review approval
GET  /queue/status              # Queue status
```

## File Locations

```
Logs:              ./logs/audit-YYYY-MM-DD.log
Environment:       ./.env (chmod 600)
Key Rotation:      ./.key-rotation
Docker Image:      drooid-sales-engine:latest
Docker Container:  drooid-sales-engine
Configuration:     ./config/agents.json
Security Modules:  ./security/
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs drooid-scheduler
# Check for .env issues or missing dependencies
```

### Rate limit errors
```bash
curl http://localhost:3000/security/status
# If blocked, wait 60 seconds for rate window reset
```

### Audit logs not writing
```bash
ls -la logs/
chmod 755 logs/
# Ensure logs directory is writable
```

### Key rotation issues
```bash
cat .key-rotation
# Should be valid JSON with ISO timestamps
# Delete to reset: rm .key-rotation
# Reinitialize: node -e "require('./security/key-rotation').init()"
```

## Security Alerts

### Critical Alerts (Action Required Immediately)
```
- API keys expired (>30 days old)
- npm audit critical vulnerabilities found
- Port exposed to 0.0.0.0
- .env permissions not 600
```

### Warning Alerts (Action Required Within 1 Week)
```
- API keys >25 days old (schedule rotation)
- npm audit high vulnerabilities
- Port exposed (non-critical)
- Dependency version outdated
```

### Info Events (Monitor/Log)
```
- Agent execution
- API calls made
- Data operations
- Approval decisions
```

## Performance Monitoring

```bash
# Check queue depth
curl http://localhost:3000/queue/status

# Monitor token usage
curl http://localhost:3000/security/status | grep tokens

# Check container resources
docker stats drooid-sales-engine
# Limits: 512MB RAM, 1 CPU
```

## Maintenance Schedule

### Daily (5 min)
- Review security events in logs
- Check for injection attempts
- Monitor error rate

### Weekly (15 min)
- Run security scan: `curl -X POST http://localhost:3000/security/scan`
- Check API key ages
- Review error logs

### Monthly (30 min)
- Full security audit
- Update dependencies: `npm audit fix`
- Rotate API keys (if >25 days old)
- Review Docker image updates
- Check capacity and performance

## Additional Resources

- Security Guide: [./SECURITY.md](./SECURITY.md)
- Implementation Summary: [./HARDENING_SUMMARY.md](./HARDENING_SUMMARY.md)
- Docker Info: [./Dockerfile](./Dockerfile)
- Environment Template: [./.env.example](./.env.example)

## Support

For security issues:
1. Check logs: `tail -f logs/audit-*.log`
2. Run scan: `curl -X POST http://localhost:3000/security/scan`
3. Review SECURITY.md for detailed information
4. Check HARDENING_SUMMARY.md for implementation details

---

Last Updated: 2026-03-22
