#!/usr/bin/env node

/**
 * Integration Test Script
 * Tests all third-party integrations and reports status
 * Usage: node scripts/test-integrations.js
 */

require('dotenv').config();

const sendGridClient = require('../integrations/sendgrid-client');
const hunterClient = require('../integrations/hunter-client');
const linkedInClient = require('../integrations/linkedin-client');

/**
 * Format output for better readability
 */
function formatResult(name, success, details = {}) {
    const status = success ? '✓ PASS' : '✗ FAIL';
    const color = success ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`\n${color}${status}${reset} ${name}`);
    if (Object.keys(details).length > 0) {
        for (const [key, value] of Object.entries(details)) {
            console.log(`  ${key}: ${value}`);
        }
    }
}

/**
 * Test SendGrid integration
 */
async function testSendGrid() {
    console.log('\n' + '='.repeat(50));
    console.log('Testing SendGrid Integration');
    console.log('='.repeat(50));

    try {
        if (!process.env.SENDGRID_API_KEY) {
            formatResult('SendGrid API Key', false, {
                status: 'Not configured',
            });
            return;
        }

        const result = await sendGridClient.testConnection();

        formatResult('SendGrid Connection', result.success, {
            message: result.message,
        });

        const stats = sendGridClient.getStats();
        console.log('\nUsage Stats:');
        console.log(`  Emails today: ${stats.emailsToday}/${stats.dailyLimit}`);
        console.log(`  Rate limit: ${stats.emailsThisMinute}/${stats.minuteLimit} per minute`);

        const templates = sendGridClient.getTemplates();
        console.log(`\nAvailable templates: ${templates.length}`);
        templates.forEach(t => {
            console.log(`  - ${t.name}`);
        });
    } catch (error) {
        formatResult('SendGrid Connection', false, {
            error: error.message,
        });
    }
}

/**
 * Test Hunter.io integration
 */
async function testHunter() {
    console.log('\n' + '='.repeat(50));
    console.log('Testing Hunter.io Integration');
    console.log('='.repeat(50));

    try {
        if (!process.env.HUNTER_API_KEY) {
            formatResult('Hunter API Key', false, {
                status: 'Not configured',
            });
            return;
        }

        const result = await hunterClient.testConnection();

        formatResult('Hunter Connection', result.success, {
            message: result.message,
            domainFound: result.domainFound || 'N/A',
            emailCount: result.emailCount || 0,
        });

        const stats = hunterClient.getStats();
        console.log('\nUsage Stats:');
        console.log(`  Requests this month: ${stats.requestsThisMonth}/${stats.monthlyLimit}`);
        console.log(`  Remaining: ${stats.remaining}`);
    } catch (error) {
        formatResult('Hunter Connection', false, {
            error: error.message,
        });
    }
}

/**
 * Test LinkedIn integration
 */
async function testLinkedIn() {
    console.log('\n' + '='.repeat(50));
    console.log('Testing LinkedIn Sales Navigator Integration');
    console.log('='.repeat(50));

    try {
        const sessionStatus = linkedInClient.getSessionStatus();

        if (!sessionStatus.isAuthenticated) {
            formatResult('LinkedIn Authentication', false, {
                authenticated: sessionStatus.isAuthenticated,
                hasCookie: sessionStatus.hasCookie,
                credentialsConfigured: sessionStatus.email === 'configured',
                note: 'Set LINKEDIN_LI_AT environment variable or call setCookie()',
            });
            return;
        }

        const result = await linkedInClient.testConnection();

        formatResult('LinkedIn Connection', result.success, {
            message: result.message,
            authenticated: result.authenticated || false,
        });

        const stats = linkedInClient.getStats();
        console.log('\nUsage Stats:');
        console.log(`  Actions today: ${stats.actionsToday}/${stats.dailyActionLimit}`);
        console.log(`  Connections today: ${stats.connectionsToday}/${stats.dailyConnectionLimit}`);
    } catch (error) {
        formatResult('LinkedIn Connection', false, {
            error: error.message,
        });
    }
}

/**
 * Test database connectivity
 */
async function testDatabase() {
    console.log('\n' + '='.repeat(50));
    console.log('Testing Database Connectivity');
    console.log('='.repeat(50));

    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            formatResult('Supabase Credentials', false, {
                SUPABASE_URL: process.env.SUPABASE_URL ? 'configured' : 'not configured',
                SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'configured' : 'not configured',
            });
            return;
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Try a simple query
        const { data, error } = await supabase
            .from('agent_logs')
            .select('count()', { count: 'exact' })
            .limit(1);

        if (error) {
            formatResult('Supabase Connection', false, {
                error: error.message,
            });
        } else {
            formatResult('Supabase Connection', true, {
                status: 'Connected',
            });
        }
    } catch (error) {
        formatResult('Supabase Connection', false, {
            error: error.message,
        });
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('\n' + '='.repeat(50));
    console.log('DROOID INTEGRATIONS TEST SUITE');
    console.log('='.repeat(50));
    console.log(`Started at: ${new Date().toISOString()}\n`);

    await testDatabase();
    await testSendGrid();
    await testHunter();
    await testLinkedIn();

    console.log('\n' + '='.repeat(50));
    console.log('Test suite completed');
    console.log('='.repeat(50) + '\n');
}

// Run tests
runAllTests().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
