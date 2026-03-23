const sgMail = require('@sendgrid/mail');
require('dotenv').config();
const { sanitize } = require('../security/input-sanitizer');
const auditLogger = require('../security/audit-logger');
const { recordAgentMetric } = require('./supabase-client');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Email template definitions for cold outreach campaigns
 */
const EMAIL_TEMPLATES = {
    cold_intro: {
        name: 'cold_intro',
        subject: 'Quick thought on {{companyName}}',
        body: `Hi {{firstName}},

I came across {{companyName}} and noticed you're doing some interesting work in {{industry}}.

I thought you might find value in our approach - we help {{targetAudience}} achieve {{keyBenefit}}.

Would you be open to a brief chat next week to explore if there's a fit?

Best,
{{senderName}}`,
    },
    follow_up_1: {
        name: 'follow_up_1',
        subject: 'Re: Quick thought on {{companyName}}',
        body: `Hi {{firstName}},

Following up on my note from 3 days ago. I shared a resource that might be helpful for your {{challenge}}.

The resource is here: {{resourceLink}}

Happy to discuss further if you're interested.

Best,
{{senderName}}`,
    },
    follow_up_2: {
        name: 'follow_up_2',
        subject: 'Recent win - {{companyName}} (similar to yours)',
        body: `Hi {{firstName}},

I wanted to share a recent case study that might be relevant to {{companyName}}.

{{caseCompanyName}} achieved {{metric}} in {{timeline}} using our solution.

Details here: {{caseStudyLink}}

Let me know if you'd like to explore a similar approach.

Best,
{{senderName}}`,
    },
    follow_up_3: {
        name: 'follow_up_3',
        subject: 'One more thing - {{companyName}}',
        body: `Hi {{firstName}},

I've reached out a few times and want to respect your time. If now isn't the right moment, I completely understand.

If circumstances change and you'd like to explore how we've helped similar companies, I'm just an email away.

Best of luck with everything at {{companyName}}.

Best,
{{senderName}}`,
    },
    proposal: {
        name: 'proposal',
        subject: 'Your custom proposal - {{companyName}}',
        body: `Hi {{firstName}},

Following our conversation, I've put together a custom proposal tailored to {{companyName}}'s needs.

Proposal details: {{proposalLink}}

Next steps: Let me know your availability for a brief call this week to walk through it.

Looking forward to partnering.

Best,
{{senderName}}`,
    },
    case_study: {
        name: 'case_study',
        subject: 'Case study: {{caseCompanyName}} success',
        body: `Hi {{firstName}},

I thought this case study from {{caseCompanyName}} might be relevant to your work at {{companyName}}.

They increased {{metric}} by {{percentage}}% in {{timeline}}.

Read the full story: {{caseStudyLink}}

Happy to discuss how this applies to your situation.

Best,
{{senderName}}`,
    },
};

/**
 * Rate limiter for SendGrid (token bucket pattern)
 */
class SendGridRateLimiter {
    constructor() {
        this.emailsToday = 0;
        this.emailsThisMinute = 0;
        this.dailyLimit = 100; // Free tier limit
        this.minuteLimit = 10;
        this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
        this.minuteResetTime = Date.now() + 60 * 1000;
    }

    resetDailyIfNeeded() {
        if (Date.now() > this.dailyResetTime) {
            this.emailsToday = 0;
            this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
        }
    }

    resetMinuteIfNeeded() {
        if (Date.now() > this.minuteResetTime) {
            this.emailsThisMinute = 0;
            this.minuteResetTime = Date.now() + 60 * 1000;
        }
    }

    canSendEmail() {
        this.resetDailyIfNeeded();
        this.resetMinuteIfNeeded();
        return this.emailsToday < this.dailyLimit && this.emailsThisMinute < this.minuteLimit;
    }

    recordEmail() {
        this.emailsToday++;
        this.emailsThisMinute++;
    }

    getStats() {
        return {
            emailsToday: this.emailsToday,
            dailyLimit: this.dailyLimit,
            emailsThisMinute: this.emailsThisMinute,
            minuteLimit: this.minuteLimit,
        };
    }
}

const rateLimiter = new SendGridRateLimiter();

/**
 * Email validation
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Template variable replacement
 */
function renderTemplate(templateBody, variables = {}) {
    let rendered = templateBody;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        rendered = rendered.replace(new RegExp(placeholder, 'g'), value || '');
    }
    return rendered;
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
 * SendGrid Email Integration Client
 */
class SendGridClient {
    constructor() {
        this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'outreach@drooid.org';
        this.apiKey = process.env.SENDGRID_API_KEY;

        if (!this.apiKey) {
            console.warn('[SendGrid] API key not configured');
        }
    }

    /**
     * Send a single personalized email
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async sendEmail(options) {
        const { to, subject, body, templateName = null, variables = {} } = options;

        // Validate email
        if (!validateEmail(to)) {
            const error = `Invalid recipient email: ${to}`;
            auditLogger.error('sendgrid-invalid-email', { email: to });
            throw new Error(error);
        }

        // Check rate limits
        if (!rateLimiter.canSendEmail()) {
            const stats = rateLimiter.getStats();
            const error = `SendGrid rate limit exceeded: ${stats.emailsToday}/${stats.dailyLimit} daily`;
            auditLogger.security('sendgrid-rate-limit-exceeded', stats);
            throw new Error(error);
        }

        // Sanitize inputs
        const { text: cleanSubject } = sanitize(subject);
        const { text: cleanBody } = sanitize(body);

        const startTime = Date.now();

        try {
            return await retryWithBackoff(async () => {
                const msg = {
                    to,
                    from: this.fromEmail,
                    subject: cleanSubject,
                    text: cleanBody,
                    html: `<p>${cleanBody.replace(/\n/g, '<br>')}</p>`,
                };

                const result = await sgMail.send(msg);

                rateLimiter.recordEmail();
                const duration = Date.now() - startTime;

                // Log to audit
                auditLogger.apiCall('sendgrid', '/mail/send', {
                    recipient: to,
                    templateName: templateName || 'custom',
                    status: 'success',
                    duration,
                });

                // Record metric
                await recordAgentMetric('sendgrid-client', 'emails_sent', 1, 'daily').catch(() => {});

                return {
                    success: true,
                    messageId: result[0].headers['x-message-id'],
                    recipient: to,
                    duration,
                };
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            auditLogger.error('sendgrid-send-failed', {
                recipient: to,
                templateName: templateName || 'custom',
                error: error.message,
                duration,
            });

            throw error;
        }
    }

    /**
     * Send a templated email
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async sendTemplatedEmail(options) {
        const { to, templateName, variables = {} } = options;

        // Validate template exists
        if (!EMAIL_TEMPLATES[templateName]) {
            throw new Error(`Template not found: ${templateName}`);
        }

        const template = EMAIL_TEMPLATES[templateName];
        const subject = renderTemplate(template.subject, variables);
        const body = renderTemplate(template.body, variables);

        return this.sendEmail({
            to,
            subject,
            body,
            templateName,
        });
    }

    /**
     * Send a follow-up sequence (drip campaign)
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async sendFollowUpSequence(options) {
        const { to, contactName, variables = {}, delayMs = 1000 } = options;

        const sequence = [
            { template: 'cold_intro', delayAfter: 0 },
            { template: 'follow_up_1', delayAfter: 3 * 24 * 60 * 60 * 1000 }, // 3 days
            { template: 'follow_up_2', delayAfter: 7 * 24 * 60 * 60 * 1000 }, // 7 days
            { template: 'follow_up_3', delayAfter: 14 * 24 * 60 * 60 * 1000 }, // 14 days
        ];

        const results = [];

        for (const step of sequence) {
            try {
                const result = await this.sendTemplatedEmail({
                    to,
                    templateName: step.template,
                    variables,
                });

                results.push({
                    templateName: step.template,
                    success: true,
                    messageId: result.messageId,
                    scheduledFor: new Date(Date.now() + step.delayAfter).toISOString(),
                });

                // Small delay between sends
                if (delayMs > 0) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            } catch (error) {
                results.push({
                    templateName: step.template,
                    success: false,
                    error: error.message,
                });
            }
        }

        // Log sequence completion
        const successCount = results.filter(r => r.success).length;
        auditLogger.action('sendgrid-sequence-sent', {
            recipient: to,
            contactName,
            sequenceLength: results.length,
            successCount,
        });

        return results;
    }

    /**
     * Track email events (open, click, bounce, etc.)
     * Note: Requires webhook configuration in SendGrid dashboard
     * @param {Object} event
     * @returns {Promise<Object>}
     */
    async trackEmailEvent(event) {
        try {
            const { eventType, email, messageId, timestamp, metadata = {} } = event;

            // Validate event
            if (!['open', 'click', 'bounce', 'reply', 'unsubscribe'].includes(eventType)) {
                throw new Error(`Invalid event type: ${eventType}`);
            }

            // Log to Supabase via audit logger
            auditLogger.action('email-event-tracked', {
                eventType,
                email,
                messageId,
                timestamp,
                metadata,
            });

            // Record metric
            await recordAgentMetric(
                'sendgrid-client',
                `email_${eventType}`,
                1,
                'daily'
            ).catch(() => {});

            return {
                success: true,
                eventType,
                email,
                messageId,
            };
        } catch (error) {
            auditLogger.error('email-event-tracking-failed', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get SendGrid usage stats
     * @returns {Object}
     */
    getStats() {
        return rateLimiter.getStats();
    }

    /**
     * Get available templates
     * @returns {Array}
     */
    getTemplates() {
        return Object.keys(EMAIL_TEMPLATES).map(name => ({
            name,
            description: EMAIL_TEMPLATES[name].name,
        }));
    }

    /**
     * Test SendGrid connection
     * @returns {Promise<Object>}
     */
    async testConnection() {
        try {
            if (!this.apiKey) {
                return {
                    success: false,
                    message: 'SendGrid API key not configured',
                };
            }

            const testMsg = {
                to: this.fromEmail,
                from: this.fromEmail,
                subject: '[Test] SendGrid Connection Test',
                text: 'This is a test email from the Drooid SendGrid integration.',
            };

            await sgMail.send(testMsg);

            auditLogger.action('sendgrid-connection-test', {
                status: 'success',
            });

            return {
                success: true,
                message: 'SendGrid connection successful',
            };
        } catch (error) {
            auditLogger.error('sendgrid-connection-test-failed', {
                error: error.message,
            });

            return {
                success: false,
                message: error.message,
            };
        }
    }
}

module.exports = new SendGridClient();
