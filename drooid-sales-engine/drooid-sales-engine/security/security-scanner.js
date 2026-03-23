// Daily automated security scanner
// Runs npm audit, checks .env permissions, validates API key age, detects anomalies

const fs = require('fs');
const path = require('path');
const { safeExec } = require('./exec-guard');
const auditLogger = require('./audit-logger');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runSecurityScan() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: [],
    severity: 'info',
  };

  // 1. npm audit check
  try {
    console.log('[SecurityScanner] Running npm audit...');
    const auditOutput = safeExec('npm audit --json', { timeout: 30000 });
    const auditData = JSON.parse(auditOutput);

    const vulnerabilities = auditData.metadata?.vulnerabilities || {};
    const critical = vulnerabilities.critical || 0;
    const high = vulnerabilities.high || 0;

    results.checks.push({
      name: 'npm-audit',
      status: critical > 0 ? 'fail' : high > 0 ? 'warn' : 'pass',
      critical,
      high,
      message: `Found ${critical} critical, ${high} high severity vulnerabilities`,
    });

    if (critical > 0) results.severity = 'critical';
    if (high > 0 && results.severity === 'info') results.severity = 'warning';
  } catch (error) {
    results.checks.push({
      name: 'npm-audit',
      status: 'error',
      error: error.message,
    });
    results.severity = 'error';
  }

  // 2. .env file permissions check
  try {
    console.log('[SecurityScanner] Checking .env permissions...');
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      const mode = (stats.mode & parseInt('777', 8)).toString(8);

      // Should be 600 (read/write owner only)
      const isSecure = mode === '600';

      results.checks.push({
        name: 'env-permissions',
        status: isSecure ? 'pass' : 'fail',
        currentMode: mode,
        expectedMode: '600',
        message: isSecure
          ? '.env has secure permissions (600)'
          : `.env has insecure permissions (${mode}), should be 600`,
      });

      if (!isSecure) results.severity = 'critical';
    } else {
      results.checks.push({
        name: 'env-permissions',
        status: 'warn',
        message: '.env file not found',
      });
    }
  } catch (error) {
    results.checks.push({
      name: 'env-permissions',
      status: 'error',
      error: error.message,
    });
  }

  // 3. API key age check
  try {
    console.log('[SecurityScanner] Checking API key ages...');
    const keyStatus = await checkKeyAges();
    results.checks.push({
      name: 'key-age',
      status: keyStatus.status,
      keysChecked: keyStatus.keys.length,
      oldKeys: keyStatus.oldKeys,
      message: keyStatus.message,
    });

    if (keyStatus.status === 'warn') results.severity = 'warning';
  } catch (error) {
    results.checks.push({
      name: 'key-age',
      status: 'error',
      error: error.message,
    });
  }

  // 4. Port exposure check
  try {
    console.log('[SecurityScanner] Checking port exposure...');
    const portCheck = checkPortExposure();
    results.checks.push({
      name: 'port-exposure',
      status: portCheck.status,
      exposedPorts: portCheck.exposed,
      message: portCheck.message,
    });

    if (!portCheck.secure) results.severity = 'warning';
  } catch (error) {
    results.checks.push({
      name: 'port-exposure',
      status: 'error',
      error: error.message,
    });
  }

  // 5. Dependency version check
  try {
    console.log('[SecurityScanner] Checking dependency versions...');
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );

    const outdated = checkOutdatedDeps(packageJson);
    results.checks.push({
      name: 'dependencies',
      status: outdated.length > 0 ? 'warn' : 'pass',
      outdatedCount: outdated.length,
      outdated,
      message: outdated.length > 0
        ? `${outdated.length} dependencies may be outdated`
        : 'All dependencies appear up to date',
    });

    if (outdated.length > 0) results.severity = 'warning';
  } catch (error) {
    results.checks.push({
      name: 'dependencies',
      status: 'error',
      error: error.message,
    });
  }

  // Log results
  auditLogger.security('security-scan-complete', {
    severity: results.severity,
    checksRun: results.checks.length,
    failedChecks: results.checks.filter(c => c.status === 'fail').length,
  });

  // Save report to Supabase
  try {
    await supabase.from('security_scans').insert([{
      timestamp: results.timestamp,
      severity: results.severity,
      report: JSON.stringify(results),
    }]);
  } catch (error) {
    console.error('[SecurityScanner] Failed to save report to Supabase:', error.message);
  }

  return results;
}

async function checkKeyAges() {
  const keyRotationPath = path.join(__dirname, '../.key-rotation');
  let keyData = {};

  if (fs.existsSync(keyRotationPath)) {
    try {
      keyData = JSON.parse(fs.readFileSync(keyRotationPath, 'utf-8'));
    } catch (error) {
      return {
        status: 'warn',
        message: 'Could not parse key rotation data',
        keys: [],
        oldKeys: 0,
      };
    }
  }

  const keys = Object.entries(keyData);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const oldKeys = keys.filter(([_, date]) => {
    const keyDate = new Date(date).getTime();
    return now - keyDate > thirtyDaysMs;
  }).length;

  return {
    status: oldKeys > 0 ? 'warn' : 'pass',
    keys,
    oldKeys,
    message: oldKeys > 0
      ? `${oldKeys} API keys older than 30 days`
      : 'All API keys are recent',
  };
}

function checkPortExposure() {
  const env = process.env;
  const exposed = [];

  // Check if listening on 0.0.0.0 or public IP
  if (env.PORT || env.SERVER_HOST) {
    const host = env.SERVER_HOST || 'localhost';
    if (host === '0.0.0.0' || host === '*' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      exposed.push(env.PORT || '3000');
    }
  }

  return {
    status: exposed.length > 0 ? 'warn' : 'pass',
    exposed,
    secure: exposed.length === 0,
    message: exposed.length > 0
      ? `Ports exposed: ${exposed.join(', ')}`
      : 'Ports are localhost-only',
  };
}

function checkOutdatedDeps(packageJson) {
  const outdated = [];
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // Known packages with security issues or major versions
  const suspiciousPatterns = {
    'express': (v) => v.startsWith('3.'),
    'express-rate-limit': (v) => !v.startsWith('^'),
    'helmet': (v) => !v.startsWith('^'),
  };

  for (const [pkg, version] of Object.entries(deps)) {
    if (suspiciousPatterns[pkg]) {
      if (suspiciousPatterns[pkg](version)) {
        outdated.push({ package: pkg, version });
      }
    }
  }

  return outdated;
}

module.exports = {
  runSecurityScan,
  checkKeyAges,
  checkPortExposure,
  checkOutdatedDeps,
};
