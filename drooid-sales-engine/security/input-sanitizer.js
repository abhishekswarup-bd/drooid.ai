// Sanitizes all external text inputs before they reach agent prompts
// Defends against prompt injection from prospect data, web scraping, emails

const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /you\s+are\s+now\s+/gi,
  /your\s+new\s+(instructions|role|task)/gi,
  /disregard\s+(your|all|the)\s+/gi,
  /forget\s+(everything|your|all)/gi,
  /override\s+(system|prompt|instructions)/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi,

  // Hidden instruction attempts
  /\u200B[\s\S]*?\u200B/g,  // zero-width space wrappers
  /\u200C[\s\S]*?\u200C/g,  // zero-width non-joiner
  /\u200D[\s\S]*?\u200D/g,  // zero-width joiner
  /\uFEFF/g,                 // BOM character

  // Base64 encoded commands
  /data:text\/[^;]+;base64,/gi,

  // Markdown/HTML injection
  /```system[\s\S]*?```/gi,
  /<!--[\s\S]*?-->/g,
  /<script[\s\S]*?<\/script>/gi,
];

const SUSPICIOUS_PHRASES = [
  'act as', 'pretend to be', 'roleplay as',
  'do not follow', 'skip the', 'bypass',
  'admin mode', 'developer mode', 'debug mode',
  'jailbreak', 'DAN mode', 'unrestricted',
  'reveal your prompt', 'show system prompt',
  'execute command', 'run command', 'shell command',
  'api key', 'password', 'secret key', 'access token',
];

function sanitize(text, options = {}) {
  if (!text || typeof text !== 'string') return {
    text: '',
    sanitized: false,
    flags: [],
    originalLength: 0,
    cleanedLength: 0
  };

  let cleaned = text;
  let flags = [];

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      flags.push(`Pattern match: ${pattern.source.substring(0, 40)}`);
      cleaned = cleaned.replace(pattern, '[REDACTED]');
    }
  }

  // Flag suspicious phrases (don't remove, just log)
  for (const phrase of SUSPICIOUS_PHRASES) {
    if (cleaned.toLowerCase().includes(phrase)) {
      flags.push(`Suspicious phrase: "${phrase}"`);
    }
  }

  // Remove control characters (except newlines and tabs)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Truncate overly long inputs (potential buffer overflow)
  const maxLength = options.maxLength || 10000;
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
    flags.push(`Truncated from ${text.length} to ${maxLength} chars`);
  }

  return {
    text: cleaned,
    sanitized: flags.length > 0,
    flags,
    originalLength: text.length,
    cleanedLength: cleaned.length
  };
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const { text } = sanitize(value);
      result[key] = text;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

module.exports = { sanitize, sanitizeObject, INJECTION_PATTERNS, SUSPICIOUS_PHRASES };
