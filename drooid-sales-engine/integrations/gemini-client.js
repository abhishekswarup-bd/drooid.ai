const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const { sanitize } = require('../security/input-sanitizer');
const auditLogger = require('../security/audit-logger');

// Dual-key API management
class GeminiKeyManager {
    constructor() {
        this.primaryKey = process.env.GEMINI_API_KEY;
        this.fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;
        this.activeKey = this.primaryKey;
        this.primaryFailures = 0;
        this.fallbackFailures = 0;
        this.keyLastSwitched = null;
    }

    getCurrentKey() {
        return this.activeKey;
    }

    switchToFallback() {
        if (this.activeKey === this.primaryKey && this.fallbackKey) {
            this.activeKey = this.fallbackKey;
            this.keyLastSwitched = new Date().toISOString();
            auditLogger.info('gemini-key-switched', {
                from: 'primary',
                to: 'fallback',
                primaryFailures: this.primaryFailures,
                timestamp: this.keyLastSwitched,
            });
            console.log('[GEMINI] Switched to fallback API key due to rate limit or error');
            return true;
        }
        return false;
    }

    switchToPrimary() {
        if (this.activeKey === this.fallbackKey && this.primaryKey) {
            this.activeKey = this.primaryKey;
            this.keyLastSwitched = new Date().toISOString();
            this.primaryFailures = 0;
            auditLogger.info('gemini-key-switched', {
                from: 'fallback',
                to: 'primary',
                fallbackFailures: this.fallbackFailures,
                timestamp: this.keyLastSwitched,
            });
            console.log('[GEMINI] Switched back to primary API key');
            return true;
        }
        return false;
    }

    recordFailure(isRateLimit = false) {
        if (this.activeKey === this.primaryKey) {
            this.primaryFailures++;
            if (isRateLimit) {
                this.switchToFallback();
            }
        } else {
            this.fallbackFailures++;
        }
    }

    getStatus() {
        return {
            activeKey: this.activeKey === this.primaryKey ? 'primary' : 'fallback',
            primaryFailures: this.primaryFailures,
            fallbackFailures: this.fallbackFailures,
            keyLastSwitched: this.keyLastSwitched,
        };
    }
}

const keyManager = new GeminiKeyManager();
let genAI = new GoogleGenerativeAI(keyManager.getCurrentKey());

// Token bucket for rate limiting
class TokenBucket {
    constructor(maxTokensPerMinute, maxRequestsPerDay) {
        this.maxTokensPerMinute = maxTokensPerMinute;
        this.maxRequestsPerDay = maxRequestsPerDay;
        this.tokensRemaining = maxTokensPerMinute;
        this.requestsToday = 0;
        this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
        this.lastRefillTime = Date.now();
    }

    refillTokens() {
        const now = Date.now();
        const timePassed = (now - this.lastRefillTime) / 60000; // minutes
        const tokensToAdd = timePassed * (this.maxTokensPerMinute / 1);
        this.tokensRemaining = Math.min(this.maxTokensPerMinute, this.tokensRemaining + tokensToAdd);
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
        return this.tokensRemaining >= tokens && this.requestsToday < this.maxRequestsPerDay;
    }

    consumeTokens(tokens) {
        this.tokensRemaining -= tokens;
        this.requestsToday += 1;
    }

    getStats() {
        return {
            tokensRemaining: Math.floor(this.tokensRemaining),
            requestsToday: this.requestsToday,
            maxRequestsPerDay: this.maxRequestsPerDay,
        };
    }
}

const bucket = new TokenBucket(250000, 250); // 250K tokens/min, 250 requests/day

// Request queue for backpressure
class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    async enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    async process() {
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
}

const requestQueue = new RequestQueue();

// Estimate tokens (rough approximation)
function estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
}

// Exponential backoff retry
async function retryWithBackoff(fn, maxAttempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts - 1) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

// Main Gemini call function
async function callGemini(prompt, options = {}) {
    const {
        systemPrompt = '',
        temperature = 0.7,
        maxTokens = 2048,
        jsonMode = false,
    } = options;

    // Sanitize inputs before processing
    const { text: cleanPrompt, sanitized: promptSanitized, flags: promptFlags } = sanitize(prompt);
    const { text: cleanSystemPrompt, sanitized: sysSanitized, flags: sysFlags } = sanitize(systemPrompt);

    if (promptSanitized || sysSanitized) {
        auditLogger.security('gemini-input-sanitized', {
            promptFlags: promptFlags || [],
            systemPromptFlags: sysFlags || [],
        });
    }

    const startTime = Date.now();
    const inputTokenEstimate = estimateTokens(cleanSystemPrompt + cleanPrompt) + 100;

    return requestQueue.enqueue(async () => {
        // Check rate limits
        if (!bucket.canUseTokens(inputTokenEstimate)) {
            throw new Error('Rate limit exceeded: Check token bucket or daily request limit');
        }

        return retryWithBackoff(async () => {
            try {
                const model = genAI.getGenerativeModel({
                    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                });

                const generationConfig = {
                    temperature,
                    maxOutputTokens: maxTokens,
                    ...(jsonMode && { responseMimeType: 'application/json' }),
                };

                const parts = [];
                if (cleanSystemPrompt) {
                    parts.push({ text: cleanSystemPrompt });
                }
                parts.push({ text: cleanPrompt });

                const response = await model.generateContent({
                    contents: [{ parts }],
                    generationConfig,
                });

                let responseText = response.response.text();

                // Validate and sanitize response to prevent prompt leakage
                const { text: cleanResponse, sanitized: responseSanitized } = sanitize(responseText, { maxLength: 50000 });

                if (responseSanitized) {
                    auditLogger.security('gemini-response-sanitized', {
                        originalLength: responseText.length,
                        cleanedLength: cleanResponse.length,
                    });
                }

                responseText = cleanResponse;
                const outputTokenEstimate = estimateTokens(responseText);
                const totalTokens = inputTokenEstimate + outputTokenEstimate;

                bucket.consumeTokens(totalTokens);

                const duration = Date.now() - startTime;

                // Log to Supabase (fire-and-forget)
                auditLogger.apiCall('gemini', '/generateContent', {
                    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                    inputTokens: inputTokenEstimate,
                    outputTokens: outputTokenEstimate,
                    totalTokens,
                    duration,
                    status: 'success',
                    apiKey: keyManager.getStatus().activeKey,
                });

                return {
                    success: true,
                    content: responseText,
                    tokens: {
                        input: inputTokenEstimate,
                        output: outputTokenEstimate,
                        total: totalTokens,
                    },
                    duration,
                };
            } catch (error) {
                const duration = Date.now() - startTime;
                const isRateLimit = error.status === 429 || error.message.includes('429') || error.message.includes('quota');

                // Log the error and track it
                auditLogger.error('gemini-call-failed', {
                    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
                    totalTokens: inputTokenEstimate,
                    duration,
                    error: error.message,
                    errorStatus: error.status,
                    apiKey: keyManager.getStatus().activeKey,
                    isRateLimit,
                });

                // If it's a rate limit error and we have a fallback key, switch and retry
                if (isRateLimit && keyManager.fallbackKey) {
                    keyManager.recordFailure(true);
                    genAI = new GoogleGenerativeAI(keyManager.getCurrentKey());
                    throw new Error(`Rate limit hit on ${keyManager.getStatus().activeKey} key. Switched to fallback. ${error.message}`);
                } else {
                    keyManager.recordFailure(false);
                }

                throw error;
            }
        });
    });
}

// Logging to Supabase
async function logToSupabase(logData) {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        await supabase.from('agent_logs').insert({
            agent_id: 'gemini-client',
            agent_name: 'Gemini API Client',
            action: logData.action,
            tokens_used: logData.totalTokens || 0,
            model: logData.model,
            duration_ms: logData.duration || 0,
            status: logData.status,
            error: logData.error || null,
        });
    } catch (error) {
        // Silent fail - don't break main flow
        console.error('Failed to log to Supabase:', error.message);
    }
}

// Get usage statistics
function getUsageStats() {
    return bucket.getStats();
}

// Reset daily counters (admin function)
function resetDailyCounters() {
    bucket.requestsToday = 0;
    bucket.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
}

module.exports = {
    callGemini,
    getUsageStats,
    resetDailyCounters,
    estimateTokens,
    getKeyStatus: () => keyManager.getStatus(),
    switchToFallback: () => keyManager.switchToFallback(),
    switchToPrimary: () => keyManager.switchToPrimary(),
};
