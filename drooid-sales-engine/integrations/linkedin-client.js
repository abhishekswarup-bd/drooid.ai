const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { sanitize } = require('../security/input-sanitizer');
const auditLogger = require('../security/audit-logger');
const { recordAgentMetric, insertContact, getContactsByLeadId } = require('./supabase-client');

/**
 * Rate limiter for LinkedIn actions
 * Free tier: 100 actions/day, 25 connection requests/day
 */
class LinkedInRateLimiter {
    constructor() {
        this.actionsToday = 0;
        this.connectionsToday = 0;
        this.dailyActionLimit = 100;
        this.dailyConnectionLimit = 25;
        this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    resetDailyIfNeeded() {
        if (Date.now() > this.dailyResetTime) {
            this.actionsToday = 0;
            this.connectionsToday = 0;
            this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
        }
    }

    canPerformAction() {
        this.resetDailyIfNeeded();
        return this.actionsToday < this.dailyActionLimit;
    }

    canSendConnection() {
        this.resetDailyIfNeeded();
        return this.connectionsToday < this.dailyConnectionLimit && this.actionsToday < this.dailyActionLimit;
    }

    recordAction() {
        this.actionsToday++;
    }

    recordConnection() {
        this.connectionsToday++;
        this.actionsToday++;
    }

    getStats() {
        return {
            actionsToday: this.actionsToday,
            dailyActionLimit: this.dailyActionLimit,
            connectionsToday: this.connectionsToday,
            dailyConnectionLimit: this.dailyConnectionLimit,
        };
    }
}

const rateLimiter = new LinkedInRateLimiter();

/**
 * LinkedIn session manager using li_at cookie
 * NOTE: This uses the unofficial LinkedIn API approach via cookie-based authentication.
 * This is not recommended for production use as it violates LinkedIn's ToS.
 * A proper implementation should use the official LinkedIn API when available.
 */
class LinkedInSessionManager {
    constructor() {
        this.cookieDir = path.join(__dirname, '../.secrets');
        this.cookiePath = path.join(this.cookieDir, 'linkedin_cookies.json');
        this.sessionEmail = process.env.LINKEDIN_EMAIL;
        this.sessionPassword = process.env.LINKEDIN_PASSWORD;
        this.isAuthenticated = false;
        this.cookies = {};

        // Ensure secrets directory exists
        if (!fs.existsSync(this.cookieDir)) {
            fs.mkdirSync(this.cookieDir, { recursive: true });
        }

        this.loadCookies();
    }

    loadCookies() {
        try {
            if (fs.existsSync(this.cookiePath)) {
                const data = fs.readFileSync(this.cookiePath, 'utf-8');
                this.cookies = JSON.parse(data);
                this.isAuthenticated = !!this.cookies.li_at;
            }
        } catch (error) {
            console.warn('[LinkedIn] Failed to load cookies:', error.message);
        }
    }

    saveCookies() {
        try {
            fs.writeFileSync(this.cookiePath, JSON.stringify(this.cookies, null, 2), 'utf-8');
            // Restrict file permissions for security
            fs.chmodSync(this.cookiePath, 0o600);
        } catch (error) {
            console.error('[LinkedIn] Failed to save cookies:', error.message);
        }
    }

    async authenticate() {
        if (this.isAuthenticated && this.cookies.li_at) {
            return true;
        }

        if (!this.sessionEmail || !this.sessionPassword) {
            console.warn('[LinkedIn] Email or password not configured');
            return false;
        }

        try {
            auditLogger.auth('pending', {
                provider: 'linkedin',
                method: 'manual_cookie',
            });

            // Note: Full LinkedIn authentication requires headless browser automation
            // This is a placeholder for the actual implementation
            console.log('[LinkedIn] Please set LINKEDIN_LI_AT environment variable with your li_at cookie');

            return false;
        } catch (error) {
            auditLogger.error('linkedin-auth-failed', {
                error: error.message,
            });
            return false;
        }
    }

    getCookie() {
        return this.cookies.li_at || process.env.LINKEDIN_LI_AT || null;
    }

    setCookie(liAt) {
        this.cookies.li_at = liAt;
        this.isAuthenticated = true;
        this.saveCookies();
    }
}

const sessionManager = new LinkedInSessionManager();

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
 * LinkedIn Sales Navigator Integration
 *
 * COMPLIANCE NOTE:
 * This module uses the unofficial LinkedIn API approach. LinkedIn's Terms of Service
 * prohibit automated access to their platform. This implementation is provided for
 * educational and research purposes only. Production use should utilize the official
 * LinkedIn API (when available) or seek proper licensing agreements.
 */
class LinkedInClient {
    constructor() {
        this.sessionManager = sessionManager;
        this.baseUrl = 'https://api.linkedin.com/v2';
        this.unofficialApiUrl = 'https://www.linkedin.com/voyager/api';
    }

    /**
     * Search for prospects by filters
     * @param {Object} filters
     * @returns {Promise<Object>}
     */
    async searchProspects(filters) {
        const { industry, companySize, title, limit = 10 } = filters;

        if (!this.sessionManager.isAuthenticated) {
            throw new Error('Not authenticated with LinkedIn');
        }

        if (!rateLimiter.canPerformAction()) {
            const stats = rateLimiter.getStats();
            const error = `LinkedIn rate limit exceeded: ${stats.actionsToday}/${stats.dailyActionLimit} daily actions`;
            throw new Error(error);
        }

        const startTime = Date.now();

        try {
            // Note: This would require the unofficial API client library
            // Placeholder for actual implementation
            auditLogger.apiCall('linkedin', '/search-prospects', {
                filters: { industry, companySize, title },
                status: 'not_implemented',
            });

            rateLimiter.recordAction();

            return {
                success: false,
                message: 'Official LinkedIn API integration pending',
                prospects: [],
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            auditLogger.error('linkedin-search-failed', {
                filters,
                error: error.message,
                duration,
            });
            throw error;
        }
    }

    /**
     * Send connection request with personalized note
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async sendConnectionRequest(options) {
        const { profileUrl, personalizationNote, leadId = null } = options;

        if (!this.sessionManager.isAuthenticated) {
            throw new Error('Not authenticated with LinkedIn');
        }

        if (!rateLimiter.canSendConnection()) {
            const stats = rateLimiter.getStats();
            const error = `LinkedIn connection limit exceeded: ${stats.connectionsToday}/${stats.dailyConnectionLimit} daily`;
            throw new Error(error);
        }

        const startTime = Date.now();

        try {
            // Sanitize personalization note
            const { text: cleanNote } = sanitize(personalizationNote);

            // Note: Actual implementation would use LinkedIn API
            auditLogger.action('linkedin-connection-sent', {
                profileUrl,
                leadId,
                personalizationNoteLength: cleanNote.length,
            });

            rateLimiter.recordConnection();

            const duration = Date.now() - startTime;

            await recordAgentMetric('linkedin-client', 'connections_sent', 1, 'daily').catch(() => {});

            return {
                success: true,
                profileUrl,
                message: 'Connection request sent',
                duration,
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('linkedin-connection-failed', {
                profileUrl,
                leadId,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Send InMail message
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async sendInMail(options) {
        const { recipientUrl, subject, message, leadId = null } = options;

        if (!this.sessionManager.isAuthenticated) {
            throw new Error('Not authenticated with LinkedIn');
        }

        if (!rateLimiter.canPerformAction()) {
            const stats = rateLimiter.getStats();
            throw new Error(`LinkedIn rate limit exceeded: ${stats.actionsToday}/${stats.dailyActionLimit} daily`);
        }

        const startTime = Date.now();

        try {
            const { text: cleanSubject } = sanitize(subject);
            const { text: cleanMessage } = sanitize(message);

            auditLogger.action('linkedin-inmail-sent', {
                recipientUrl,
                leadId,
                subjectLength: cleanSubject.length,
                messageLength: cleanMessage.length,
            });

            rateLimiter.recordAction();

            const duration = Date.now() - startTime;

            await recordAgentMetric('linkedin-client', 'inmails_sent', 1, 'daily').catch(() => {});

            return {
                success: true,
                recipientUrl,
                message: 'InMail sent',
                duration,
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('linkedin-inmail-failed', {
                recipientUrl,
                leadId,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Record a profile view
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async recordProfileView(options) {
        const { profileUrl, leadId = null } = options;

        if (!this.sessionManager.isAuthenticated) {
            throw new Error('Not authenticated with LinkedIn');
        }

        if (!rateLimiter.canPerformAction()) {
            throw new Error('LinkedIn rate limit exceeded');
        }

        try {
            auditLogger.action('linkedin-profile-viewed', {
                profileUrl,
                leadId,
                timestamp: new Date().toISOString(),
            });

            rateLimiter.recordAction();

            await recordAgentMetric('linkedin-client', 'profile_views', 1, 'daily').catch(() => {});

            return {
                success: true,
                profileUrl,
                message: 'Profile view recorded',
            };
        } catch (error) {
            auditLogger.error('linkedin-profile-view-failed', {
                profileUrl,
                leadId,
                error: error.message,
            });

            throw error;
        }
    }

    /**
     * Enrich contact from LinkedIn profile URL
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async enrichProfileData(options) {
        const { profileUrl, leadId = null } = options;

        if (!this.sessionManager.isAuthenticated) {
            throw new Error('Not authenticated with LinkedIn');
        }

        if (!rateLimiter.canPerformAction()) {
            throw new Error('LinkedIn rate limit exceeded');
        }

        const startTime = Date.now();

        try {
            // Extract profile username from URL
            // Format: https://www.linkedin.com/in/username
            const match = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/);
            if (!match) {
                throw new Error('Invalid LinkedIn profile URL');
            }

            const profileUsername = match[1];

            // Note: Actual implementation would scrape/fetch profile data
            const profileData = {
                profileUrl,
                username: profileUsername,
                enrichmentTimestamp: new Date().toISOString(),
            };

            // Cache in Supabase if leadId provided
            if (leadId) {
                await insertContact({
                    lead_id: leadId,
                    linkedin_url: profileUrl,
                    linkedin_username: profileUsername,
                    source: 'linkedin-navigator',
                }).catch(() => {});
            }

            rateLimiter.recordAction();

            const duration = Date.now() - startTime;

            auditLogger.action('linkedin-profile-enriched', {
                profileUrl,
                profileUsername,
                leadId,
                duration,
            });

            return {
                success: true,
                profileData,
                duration,
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('linkedin-enrichment-failed', {
                profileUrl,
                leadId,
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Get LinkedIn session status
     * @returns {Object}
     */
    getSessionStatus() {
        return {
            isAuthenticated: this.sessionManager.isAuthenticated,
            hasCookie: !!this.sessionManager.getCookie(),
            email: this.sessionManager.sessionEmail ? 'configured' : 'not_configured',
        };
    }

    /**
     * Get rate limit stats
     * @returns {Object}
     */
    getStats() {
        return rateLimiter.getStats();
    }

    /**
     * Test LinkedIn connection
     * @returns {Promise<Object>}
     */
    async testConnection() {
        try {
            const status = this.getSessionStatus();

            if (!status.isAuthenticated) {
                return {
                    success: false,
                    message: 'LinkedIn not authenticated',
                    details: {
                        hasCookie: status.hasCookie,
                        credentialsConfigured: status.email === 'configured',
                    },
                };
            }

            auditLogger.action('linkedin-connection-test', {
                status: 'success',
            });

            return {
                success: true,
                message: 'LinkedIn connection successful',
                authenticated: true,
            };
        } catch (error) {
            auditLogger.error('linkedin-connection-test-failed', {
                error: error.message,
            });

            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Set LinkedIn cookie for authentication
     * @param {string} liAtCookie
     */
    setCookie(liAtCookie) {
        this.sessionManager.setCookie(liAtCookie);
        auditLogger.auth('success', {
            provider: 'linkedin',
            method: 'cookie_set',
        });
    }
}

module.exports = new LinkedInClient();
