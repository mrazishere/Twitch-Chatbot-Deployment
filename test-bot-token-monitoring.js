#!/usr/bin/env node
/**
 * Bot OAuth Token Monitoring Test
 * Verifies that Bot OAuth Token notifications still work after adding App Token monitoring
 */

const axios = require('axios');
require('dotenv').config();

const TelegramNotifier = require('./telegram-notifier');
const telegram = new TelegramNotifier();

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testBotTokenValidation() {
    log('\n🧪 TEST: Bot OAuth Token Validation', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        const token = process.env.TWITCH_OAUTH?.replace('oauth:', '');

        if (!token) {
            log('❌ No bot token found in .env', 'red');
            return false;
        }

        log('Validating Bot OAuth Token with Twitch API...', 'yellow');

        const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `OAuth ${token}` },
            timeout: 5000
        });

        const data = response.data;
        const daysLeft = Math.floor(data.expires_in / 86400);
        const hoursLeft = Math.floor((data.expires_in % 86400) / 3600);

        log(`✅ Bot token is valid`, 'green');
        log(`   User: ${data.login}`, 'green');
        log(`   Client ID: ${data.client_id.substring(0, 6)}...`, 'green');
        log(`   Expires in: ${daysLeft} days, ${hoursLeft} hours`, 'green');
        log(`   Scopes: ${data.scopes.join(', ')}`, 'green');

        return { valid: true, daysLeft, hoursLeft, data };

    } catch (error) {
        log(`❌ Bot token validation failed: ${error.message}`, 'red');
        return { valid: false, error };
    }
}

async function testBotTokenNotifications() {
    log('\n🧪 TEST: Bot OAuth Token Notifications', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        // Test notification for 7 days remaining
        log('Testing notification for bot token expiring in 7 days...', 'yellow');
        await telegram.notifyBotTokenExpiry(7, 0);
        log('✅ 7-day warning notification sent', 'green');

        await sleep(2000);

        // Test notification for 2 days remaining
        log('Testing notification for bot token expiring in 2 days...', 'yellow');
        await telegram.notifyBotTokenExpiry(2, 12);
        log('✅ 2-day urgent notification sent', 'green');

        await sleep(2000);

        // Test critical notification
        log('Testing notification for expired bot token...', 'yellow');
        await telegram.notifyBotTokenExpiry(0, 0);
        log('✅ Critical expiry notification sent', 'green');

        return true;

    } catch (error) {
        log(`❌ Notification test failed: ${error.message}`, 'red');
        return false;
    }
}

async function testOAuthServiceMonitoring() {
    log('\n🧪 TEST: OAuth Service Monitoring Both Tokens', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('pm2 logs "OAuth Token Manager" --lines 30 --nostream', (error, stdout, stderr) => {
                if (error) {
                    log(`❌ Failed to check OAuth logs: ${error.message}`, 'red');
                    resolve(false);
                    return;
                }

                const hasBotTokenCheck = stdout.includes('Bot token expires in');
                const hasAppTokenCheck = stdout.includes('App Access Token expires in');
                const hasTokenManager = stdout.includes('Starting Token Manager (Bot + App Access)');

                log('Checking OAuth service logs...', 'yellow');

                if (hasTokenManager) {
                    log('✅ Token Manager started correctly', 'green');
                } else {
                    log('⚠️  Token Manager start message not found', 'yellow');
                }

                if (hasBotTokenCheck) {
                    log('✅ Bot OAuth Token monitoring active', 'green');
                    // Extract the expiry info
                    const botMatch = stdout.match(/Bot token expires in (\d+) days/);
                    if (botMatch) {
                        log(`   Bot token: ${botMatch[1]} days remaining`, 'green');
                    }
                } else {
                    log('❌ Bot OAuth Token monitoring NOT found', 'red');
                }

                if (hasAppTokenCheck) {
                    log('✅ App Access Token monitoring active', 'green');
                    // Extract the expiry info
                    const appMatch = stdout.match(/App Access Token expires in (\d+) days/);
                    if (appMatch) {
                        log(`   App token: ${appMatch[1]} days remaining`, 'green');
                    }
                } else {
                    log('❌ App Access Token monitoring NOT found', 'red');
                }

                resolve(hasBotTokenCheck && hasAppTokenCheck);
            });
        });

    } catch (error) {
        log(`❌ OAuth monitoring test failed: ${error.message}`, 'red');
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    log('\n' + '═'.repeat(60), 'cyan');
    log('     BOT OAUTH TOKEN MONITORING TEST', 'cyan');
    log('═'.repeat(60) + '\n', 'cyan');

    const results = {
        validation: null,
        notifications: false,
        monitoring: false
    };

    try {
        // Test bot token validation
        results.validation = await testBotTokenValidation();
        await sleep(1000);

        // Test notifications (will send 3 test messages)
        log('\n⚠️  Next test will send 3 test notifications to Telegram', 'yellow');
        log('Press Ctrl+C to skip, or wait 3 seconds to continue...', 'yellow');
        await sleep(3000);

        results.notifications = await testBotTokenNotifications();
        await sleep(1000);

        // Test OAuth service monitoring
        results.monitoring = await testOAuthServiceMonitoring();

    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`, 'red');
    }

    // Summary
    log('\n' + '═'.repeat(60), 'cyan');
    log('       TEST RESULTS SUMMARY', 'cyan');
    log('═'.repeat(60), 'cyan');

    const tests = [
        {
            name: 'Bot Token Validation',
            result: results.validation?.valid,
            details: results.validation?.valid
                ? `${results.validation.daysLeft} days remaining`
                : 'Failed'
        },
        {
            name: 'Bot Token Notifications',
            result: results.notifications,
            details: 'Telegram alerts working'
        },
        {
            name: 'Dual Token Monitoring',
            result: results.monitoring,
            details: 'Bot + App tokens monitored'
        }
    ];

    tests.forEach(test => {
        const status = test.result ? '✅ PASS' : '❌ FAIL';
        const color = test.result ? 'green' : 'red';
        log(`${status} - ${test.name} (${test.details})`, color);
    });

    const passCount = [results.validation?.valid, results.notifications, results.monitoring].filter(r => r).length;
    const totalCount = 3;

    log('\n' + '═'.repeat(60), 'cyan');

    if (passCount === totalCount) {
        log('🎉 ALL TESTS PASSED!', 'green');
        log('\nBot OAuth Token monitoring is working correctly.', 'green');
        log('No functionality was broken by adding App Token monitoring.', 'green');
    } else {
        log(`⚠️  ${passCount}/${totalCount} tests passed`, 'yellow');
        log('Review logs above for details.', 'yellow');
    }

    log('═'.repeat(60) + '\n', 'cyan');
}

// Run tests
runTests()
    .then(() => process.exit(0))
    .catch(error => {
        log(`\n❌ Fatal error: ${error.message}`, 'red');
        process.exit(1);
    });
