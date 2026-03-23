// Rate limiting for both Gemini API calls and Express endpoints
// Uses token bucket algorithm for fair distribution

const auditLogger = require('./audit-logger');

// Token bucket for Gemini API calls
class GeminiRateLimiter {
  constructor(tokensPerMinute = 250000, requestsPerDay = 250) {
    this.tokensPerMinute = tokensPerMinute;
    this.requestsPerDay = requestsPerDay;
    this.tokensRemaining = tokensPerMinute;
    this.requestsToday = 0;
    this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
    this.lastRefillTime = Date.now();
    this.queue = [];
    this.processing = false;
  }

  refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 60000; // minutes
    const tokensToAdd = timePassed * this.tokensPerMinute;
    this.tokensRemaining = Math.min(this.tokensPerMinute, this.tokensRemaining + tokensToAdd);
    this.lastRefillTime = now;
  }

  resetDailyIfNeeded() {
    if (Date.now() > this.dailyResetTime) {
      this.requestsToday = 0;
      this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
    }
  }

  canUseTokens(tokens) {
    this.refillTokens();
    this.resetDailyIfNeeded();
    return this.tokensRemaining >= tokens && this.requestsToday < this.requestsPerDay;
  }

  consumeTokens(tokens) {
    if (this.tokensRemaining >= tokens) {
      this.tokensRemaining -= tokens;
      this.requestsToday += 1;
      return true;
    }
    return false;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  getStats() {
    return {
      tokensRemaining: Math.floor(this.tokensRemaining),
      requestsToday: this.requestsToday,
      maxRequestsPerDay: this.requestsPerDay,
    };
  }
}

// Express middleware for per-IP rate limiting (60 req/min)
class ExpressRateLimiter {
  constructor(requestsPerMinute = 60) {
    this.requestsPerMinute = requestsPerMinute;
    this.ipBuckets = new Map();
  }

  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window

      if (!this.ipBuckets.has(ip)) {
        this.ipBuckets.set(ip, { requests: [], blocked: false });
      }

      const bucket = this.ipBuckets.get(ip);

      // Clean old requests outside window
      bucket.requests = bucket.requests.filter(time => time > windowStart);

      // Check if IP is blocked
      if (bucket.blocked && now - bucket.blockedAt < 60000) {
        auditLogger.security('rate-limit-blocked', { ip, reason: 'IP temporarily blocked' });
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      // Reset block flag after 1 minute
      if (bucket.blocked && now - bucket.blockedAt >= 60000) {
        bucket.blocked = false;
      }

      // Check request count
      if (bucket.requests.length >= this.requestsPerMinute) {
        bucket.blocked = true;
        bucket.blockedAt = now;
        auditLogger.security('rate-limit-exceeded', { ip, requestCount: bucket.requests.length });
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      bucket.requests.push(now);
      next();
    };
  }

  getStats(ip) {
    if (!this.ipBuckets.has(ip)) return null;
    const bucket = this.ipBuckets.get(ip);
    const now = Date.now();
    const windowStart = now - 60000;
    const recentRequests = bucket.requests.filter(time => time > windowStart);
    return {
      ip,
      requestsInWindow: recentRequests.length,
      blocked: bucket.blocked,
    };
  }
}

module.exports = {
  GeminiRateLimiter,
  ExpressRateLimiter,
};
