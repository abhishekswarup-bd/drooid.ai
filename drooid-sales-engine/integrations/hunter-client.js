const https = require('https');
require('dotenv').config();
const { sanitize } = require('../security/input-sanitizer');
const auditLogger = require('../security/audit-logger');
const { recordAgentMetric, insertContact, getContactsByLeadId } = require('./supabase-client');

/**
 * Hunter.io API rate limiter (free tier: 25 requests/month)
 */
class HunterRateLimiter {
    constructor() {
        this.requestsThisMonth = 0;
        this.monthlyLimit = 25;
        this.monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.nextMonthResetDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    }

    resetMonthlyIfNeeded() {
        if (Date.now() >= this.nextMonthResetDate) {
            this.requestsThisMonth = 0;
            this.monthStartDate = new Date();
            this.nextMonthResetDate = new Date(
                new Date().getFullYear(),
                new Date().getMonth() + 1,
                1
            );
        }
    }

    canMakeRequest() {
        this.resetMonthlyIfNeeded();
        return this.requestsThisMonth < this.monthlyLimit;
    }

    recordRequest() {
        this.requestsThisMonth++;
    }

    getStats() {
        return {
            requestsThisMonth: this.requestsThisMonth,
            monthlyLimit: this.monthlyLimit,
            remaining: Math.max(0, this.monthlyLimit - this.requestsThisMonth),
        };
    }
}

const rateLimiter = new HunterRateLimiter();

/**
 * Make HTTP request to Hunter.io API
 */
function makeHunterRequest(method, path, apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.hunter.io',
            path: `/v2${path}${path.includes('?') ? '&' : '?'}domain=true&api_key=${apiKey}`,
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        data: parsed,
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse Hunter.io response: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Exponential backoff retry
 */
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

/**
 * Hunter.io Email Finder Integration
 */
class HunterClient {
    constructor() {
        this.apiKey = process.env.HUNTER_API_KEY;
        this.baseUrl = 'https://api.hunter.io/v2';

        if (!this.apiKey) {
            console.warn('[Hunter] API key not configured');
        }
    }

    /**
     * Find email by domain and name
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async findEmail(options) {
        const { domain, firstName, lastName } = options;

        if (!this.apiKey) {
            throw new Error('Hunter API key not configured');
        }

        if (!rateLimiter.canMakeRequest()) {
            const stats = rateLimiter.getStats();
            const error = `Hunter rate limit exceeded: ${stats.requestsThisMonth}/${stats.monthlyLimit} monthly`;
            auditLogger.security('hunter-rate-limit-exceeded', stats);
            throw new Error(error);
        }

        const startTime = Date.now();

        try {
            return await retryWithBackoff(async () => {
                const path = `/email?domain=${domain}&first_name=${firstName}&last_name=${lastName}`;
                const response = await makeHunterRequest('GET', path, this.apiKey);

                rateLimiter.recordRequest();
                const duration = Date.now() - startTime;

                if (response.status !== 200) {
                    throw new Error(`Hunter API error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
                }

                const { data } = response;

                auditLogger.apiCall('hunter', '/email', {
                    domain,
                    firstName,
                    lastName,
                    status: 'success',
                    confidence: data.data?.confidence || null,
                    duration,
                });

                await recordAgentMetric('hunter-client', 'email_searches', 1, 'daily').catch(() => {});

                return {
                    success: true,
                    email: data.data?.email || null,
                    confidence: data.data?.confidence || 0,
                    sources: data.data?.sources || [],
                    firstName: data.data?.first_name || firstName,
                    lastName: data.data?.last_name || lastName,
                    domain,
                    duration,
                };
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('hunter-find-email-failed', {
                domain,
                firstName,
                lastName,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Find all emails at a domain
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async domainSearch(options) {
        const { domain, limit = 10 } = options;

        if (!this.apiKey) {
            throw new Error('Hunter API key not configured');
        }

        if (!rateLimiter.canMakeRequest()) {
            const stats = rateLimiter.getStats();
            const error = `Hunter rate limit exceeded: ${stats.requestsThisMonth}/${stats.monthlyLimit} monthly`;
            throw new Error(error);
        }

        const startTime = Date.now();

        try {
            return await retryWithBackoff(async () => {
                const path = `/domain-search?domain=${domain}&limit=${limit}`;
                const response = await makeHunterRequest('GET', path, this.apiKey);

                rateLimiter.recordRequest();
                const duration = Date.now() - startTime;

                if (response.status !== 200) {
                    throw new Error(`Hunter API error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
                }

                const { data } = response;

                auditLogger.apiCall('hunter', '/domain-search', {
                    domain,
                    status: 'success',
                    emailCount: data.data?.emails?.length || 0,
                    duration,
                });

                await recordAgentMetric('hunter-client', 'domain_searches', 1, 'daily').catch(() => {});

                return {
                    success: true,
                    domain,
                    emails: (data.data?.emails || []).map(email => ({
                        email: email.value,
                        firstName: email.first_name,
                        lastName: email.last_name,
                        title: email.title,
                        department: email.department,
                        confidence: email.confidence,
                        sources: email.sources,
                    })),
                    companyInfo: {
                        name: data.data?.domain?.organization || domain,
                        website: data.data?.domain?.website || null,
                        country: data.data?.domain?.country || null,
                    },
                    duration,
                };
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('hunter-domain-search-failed', {
                domain,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Verify an email address
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async verifyEmail(options) {
        const { email, domain } = options;

        if (!this.apiKey) {
            throw new Error('Hunter API key not configured');
        }

        if (!rateLimiter.canMakeRequest()) {
            const stats = rateLimiter.getStats();
            throw new Error(`Hunter rate limit exceeded: ${stats.requestsThisMonth}/${stats.monthlyLimit} monthly`);
        }

        const startTime = Date.now();

        try {
            return await retryWithBackoff(async () => {
                const path = `/email-verifier?email=${email}&domain=${domain}`;
                const response = await makeHunterRequest('GET', path, this.apiKey);

                rateLimiter.recordRequest();
                const duration = Date.now() - startTime;

                if (response.status !== 200) {
                    throw new Error(`Hunter API error: ${response.data.errors?.[0]?.message || 'Unknown error'}`);
                }

                const { data } = response;

                auditLogger.apiCall('hunter', '/email-verifier', {
                    email,
                    domain,
                    status: 'success',
                    result: data.data?.result || 'unknown',
                    duration,
                });

                return {
                    success: true,
                    email,
                    isValid: data.data?.result === 'deliverable',
                    result: data.data?.result, // 'deliverable', 'risky', 'invalid', 'unknown'
                    reason: data.data?.reason || null,
                    riskLevel: data.data?.risk_level || null,
                    duration,
                };
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('hunter-verify-email-failed', {
                email,
                domain,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Enrich contact data with Hunter info
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async enrichContact(options) {
        const { domain, firstName, lastName, leadId = null } = options;

        try {
            // Find email
            const emailResult = await this.findEmail({
                domain,
                firstName,
                lastName,
            });

            if (!emailResult.email) {
                return {
                    success: false,
                    message: 'Email not found',
                    enrichedData: null,
                };
            }

            // Verify email
            const verifyResult = await this.verifyEmail({
                email: emailResult.email,
                domain,
            });

            const enrichedData = {
                email: emailResult.email,
                firstName: emailResult.firstName,
                lastName: emailResult.lastName,
                domain,
                confidence: emailResult.confidence,
                isValid: verifyResult.isValid,
                sources: emailResult.sources,
            };

            // Cache in Supabase if leadId provided
            if (leadId) {
                await insertContact({
                    lead_id: leadId,
                    name: `${emailResult.firstName} ${emailResult.lastName}`,
                    email: emailResult.email,
                    domain,
                    confidence_score: emailResult.confidence,
                    source: 'hunter-io',
                }).catch(() => {});
            }

            auditLogger.action('contact-enriched', {
                domain,
                firstName,
                lastName,
                email: emailResult.email,
                leadId,
            });

            return {
                success: true,
                enrichedData,
            };
        } catch (error) {
            auditLogger.error('contact-enrichment-failed', {
                domain,
                firstName,
                lastName,
                error: error.message,
            });

            throw error;
        }
    }

    /**
     * Get Hunter API usage stats
     * @returns {Object}
     */
    getStats() {
        return rateLimiter.getStats();
    }

    /**
     * Test Hunter connection
     * @returns {Promise<Object>}
     */
    async testConnection() {
        try {
            if (!this.apiKey) {
                return {
                    success: false,
                    message: 'Hunter API key not configured',
                };
            }

            // Try a domain search for drooid.org
            const result = await this.domainSearch({
                domain: 'drooid.org',
                limit: 1,
            });

            auditLogger.action('hunter-connection-test', {
                status: 'success',
            });

            return {
                success: true,
                message: 'Hunter connection successful',
                domainFound: result.domain,
                emailCount: result.emails.length,
            };
        } catch (error) {
            auditLogger.error('hunter-connection-test-failed', {
                error: error.message,
            });

            return {
                success: false,
                message: error.message,
            };
        }
    }
}

module.exports = new HunterClient();
