// API Key rotation helper
// Tracks key ages and reminds when rotation is needed

const fs = require('fs');
const path = require('path');
const auditLogger = require('./audit-logger');

const KEY_ROTATION_FILE = path.join(__dirname, '../.key-rotation');
const ROTATION_THRESHOLD_DAYS = 25;
const MAX_KEY_AGE_DAYS = 30;

// Initialize key rotation tracking
function init() {
  const keys = {
    gemini_api_key: new Date().toISOString(),
    supabase_service_key: new Date().toISOString(),
    supabase_api_key: new Date().toISOString(),
  };

  fs.writeFileSync(KEY_ROTATION_FILE, JSON.stringify(keys, null, 2), 'utf-8');
  auditLogger.action('key-rotation-init', { keys: Object.keys(keys) });
  console.log('[KeyRotation] Key rotation tracking initialized');

  return keys;
}

// Check age of all keys
function check() {
  if (!fs.existsSync(KEY_ROTATION_FILE)) {
    console.warn('[KeyRotation] Key rotation file not found. Run init() first.');
    return null;
  }

  const keyData = JSON.parse(fs.readFileSync(KEY_ROTATION_FILE, 'utf-8'));
  const now = new Date();
  const status = [];

  for (const [keyName, dateStr] of Object.entries(keyData)) {
    const keyDate = new Date(dateStr);
    const ageMs = now - keyDate;
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    status.push({
      key: keyName,
      rotatedAt: dateStr,
      ageDays,
      needsRotation: ageDays > ROTATION_THRESHOLD_DAYS,
      isExpired: ageDays > MAX_KEY_AGE_DAYS,
    });
  }

  return status;
}

// Mark a key as rotated
function rotated(keyName) {
  if (!fs.existsSync(KEY_ROTATION_FILE)) {
    console.error('[KeyRotation] Key rotation file not found');
    return false;
  }

  const keyData = JSON.parse(fs.readFileSync(KEY_ROTATION_FILE, 'utf-8'));

  if (!keyData.hasOwnProperty(keyName)) {
    console.error(`[KeyRotation] Unknown key: ${keyName}`);
    return false;
  }

  keyData[keyName] = new Date().toISOString();
  fs.writeFileSync(KEY_ROTATION_FILE, JSON.stringify(keyData, null, 2), 'utf-8');

  auditLogger.action('key-rotated', { keyName });
  console.log(`[KeyRotation] Marked ${keyName} as rotated`);

  return true;
}

// Remind about keys that need rotation
function remind() {
  const status = check();
  if (!status) return null;

  const needsRotation = status.filter(s => s.needsRotation);
  const isExpired = status.filter(s => s.isExpired);

  const reminder = {
    timestamp: new Date().toISOString(),
    needsRotation: needsRotation.map(s => s.key),
    isExpired: isExpired.map(s => s.key),
    allStatus: status,
  };

  if (needsRotation.length > 0) {
    console.warn(`[KeyRotation] ${needsRotation.length} keys need rotation:`, needsRotation.map(s => s.key));
    auditLogger.security('key-rotation-needed', {
      keys: needsRotation.map(s => s.key),
      count: needsRotation.length,
    });
  }

  if (isExpired.length > 0) {
    console.error(`[KeyRotation] ${isExpired.length} keys are EXPIRED:`, isExpired.map(s => s.key));
    auditLogger.security('key-rotation-expired', {
      keys: isExpired.map(s => s.key),
      count: isExpired.length,
      severity: 'critical',
    });
  }

  return reminder;
}

// Get detailed report
function report() {
  const status = check();
  if (!status) return null;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: status.length,
      needsRotation: status.filter(s => s.needsRotation && !s.isExpired).length,
      expired: status.filter(s => s.isExpired).length,
    },
    details: status,
    rotationThresholdDays: ROTATION_THRESHOLD_DAYS,
    maxAgeDays: MAX_KEY_AGE_DAYS,
  };
}

module.exports = {
  init,
  check,
  rotated,
  remind,
  report,
  ROTATION_THRESHOLD_DAYS,
  MAX_KEY_AGE_DAYS,
};
