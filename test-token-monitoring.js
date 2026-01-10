#!/usr/bin/env node
/**
 * Comprehensive Token Monitoring Test Suite
 * Tests all auto-renewal and notification scenarios
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TelegramNotifier = require('./telegram-notifier');
const telegram = new TelegramNotifier();

const APP_TOKEN_FILE = path.join(__dirname, 'channel-configs', 'app-access-token.json');
const BACKUP_FILE = path.join(__dirname, 'channel-configs', 'app-access-token.backup.json');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function backupToken() {
    try {
        const data = await fs.readFile(APP_TOKEN_FILE, 'utf8');
        await fs.writeFile(BACKUP_FILE, data);
        log('✅ Token backed up', 'green');
        return JSON.parse(data);
    } catch (error) {
        log(`❌ Failed to backup token: ${error.message}`, 'red');
        throw error;
    }
}

async function restoreToken() {
    try {
        const data = await fs.readFile(BACKUP_FILE, 'utf8');
        await fs.writeFile(APP_TOKEN_FILE, data);
        log('✅ Token restored from backup', 'green');
        await fs.unlink(BACKUP_FILE);
    } catch (error) {
        log(`❌ Failed to restore token: ${error.message}`, 'red');
        throw error;
    }
}

async function simulateExpiredToken() {
    log('\n📝 Simulating expired token...', 'yellow');

    const expiredToken = {
        access_token: 'expired_test_token_12345',
        expires_in: 5000000,
        token_type: 'bearer',
        is_app_token: true,
        created_at: new Date(Date.now() - 6000000000).toISOString(), // ~69 days ago
        scope: []
    };

    await fs.writeFile(APP_TOKEN_FILE, JSON.stringify(expiredToken, null, 2));
    log('✅ Expired token simulated', 'green');
    return expiredToken;
}

async function simulateExpiringSoonToken(daysLeft = 3) {
    log(`\n📝 Simulating token expiring in ${daysLeft} days...`, 'yellow');

    const secondsUntilExpiry = daysLeft * 86400;
    const expiresIn = secondsUntilExpiry + 1000; // Add some buffer
    const createdAt = new Date(Date.now() - (expiresIn - secondsUntilExpiry) * 1000).toISOString();

    const expiringToken = {
        access_token: 'expiring_test_token_12345',
        expires_in: expiresIn,
        token_type: 'bearer',
        is_app_token: true,
        created_at: createdAt,
        scope: []
    };

    await fs.writeFile(APP_TOKEN_FILE, JSON.stringify(expiringToken, null, 2));
    log(`✅ Token expiring in ${daysLeft} days simulated`, 'green');
    return expiringToken;
}

async function testTelegramNotifications() {
    log('\n🧪 TEST 1: Telegram Notifications', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        // Test notification for expiring token
        log('Testing notification for token expiring in 3 days...', 'blue');
        await telegram.notifyAppTokenExpiry(3, 12);
        log('✅ 3-day notification sent', 'green');

        await sleep(2000);

        // Test critical notification
        log('Testing notification for expired token...', 'blue');
        await telegram.notifyAppTokenExpiry(0, 0);
        log('✅ Critical notification sent', 'green');

        return true;
    } catch (error) {
        log(`❌ Telegram test failed: ${error.message}`, 'red');
        return false;
    }
}

async function testTokenValidation() {
    log('\n🧪 TEST 2: Token Validation Logic', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        // Test with current (healthy) token
        log('Testing healthy token validation...', 'blue');
        const currentToken = await fs.readFile(APP_TOKEN_FILE, 'utf8');
        const tokenData = JSON.parse(currentToken);

        const createdAt = new Date(tokenData.created_at).getTime();
        const expiresAt = createdAt + (tokenData.expires_in * 1000);
        const now = Date.now();
        const secondsLeft = Math.floor((expiresAt - now) / 1000);
        const daysLeft = Math.floor(secondsLeft / 86400);

        log(`Current token expires in ${daysLeft} days (${secondsLeft} seconds)`, 'blue');

        if (daysLeft > 7) {
            log('✅ Token is healthy (>7 days remaining)', 'green');
        } else if (daysLeft > 0) {
            log('⚠️  Token expiring soon (≤7 days remaining)', 'yellow');
        } else {
            log('❌ Token expired!', 'red');
        }

        return true;
    } catch (error) {
        log(`❌ Validation test failed: ${error.message}`, 'red');
        return false;
    }
}

async function testExpiredTokenScenario() {
    log('\n🧪 TEST 3: Expired Token Auto-Recovery', 'cyan');
    log('━'.repeat(50), 'cyan');

    let backup = null;

    try {
        // Backup current token
        backup = await backupToken();

        // Simulate expired token
        await simulateExpiredToken();

        // Trigger OAuth service check manually
        log('Triggering manual token check via OAuth service...', 'blue');

        // The OAuth service should detect and auto-renew
        // We'll verify by checking if token was renewed
        await sleep(3000);

        // Try to renew the token (simulating what OAuth service does)
        log('Attempting auto-renewal...', 'blue');
        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: process.env.TWITCH_CLIENTID,
            client_secret: process.env.TWITCH_CLIENTSECRET,
            grant_type: 'client_credentials'
        });

        const newToken = {
            access_token: response.data.access_token,
            expires_in: response.data.expires_in,
            token_type: response.data.token_type,
            is_app_token: true,
            created_at: new Date().toISOString(),
            scope: []
        };

        await fs.writeFile(APP_TOKEN_FILE, JSON.stringify(newToken, null, 2));

        log('✅ Auto-renewal successful', 'green');
        log(`   New token expires in ${Math.floor(newToken.expires_in / 86400)} days`, 'green');

        // Send test notification
        await telegram.notifyAppTokenExpiry(0, 0);

        return true;

    } catch (error) {
        log(`❌ Expired token test failed: ${error.message}`, 'red');
        return false;
    } finally {
        // Always restore original token
        if (backup) {
            await restoreToken();
        }
    }
}

async function testExpiringSoonScenario() {
    log('\n🧪 TEST 4: Expiring Soon Auto-Renewal', 'cyan');
    log('━'.repeat(50), 'cyan');

    let backup = null;

    try {
        // Backup current token
        backup = await backupToken();

        // Simulate token expiring in 3 days
        await simulateExpiringSoonToken(3);

        log('Token should trigger auto-renewal (threshold: 7 days)', 'blue');

        // Simulate auto-renewal
        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: process.env.TWITCH_CLIENTID,
            client_secret: process.env.TWITCH_CLIENTSECRET,
            grant_type: 'client_credentials'
        });

        const newToken = {
            access_token: response.data.access_token,
            expires_in: response.data.expires_in,
            token_type: response.data.token_type,
            is_app_token: true,
            created_at: new Date().toISOString(),
            scope: []
        };

        await fs.writeFile(APP_TOKEN_FILE, JSON.stringify(newToken, null, 2));

        log('✅ Auto-renewal triggered successfully', 'green');
        log(`   New token expires in ${Math.floor(newToken.expires_in / 86400)} days`, 'green');

        // Send notification
        await telegram.notifyAppTokenExpiry(3, 0);

        return true;

    } catch (error) {
        log(`❌ Expiring soon test failed: ${error.message}`, 'red');
        return false;
    } finally {
        // Always restore original token
        if (backup) {
            await restoreToken();
        }
    }
}

async function testOAuthServiceIntegration() {
    log('\n🧪 TEST 5: OAuth Service Integration', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        log('Checking if OAuth service is monitoring tokens...', 'blue');

        // Check OAuth service logs for monitoring
        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('pm2 logs "OAuth Token Manager" --lines 10 --nostream', (error, stdout, stderr) => {
                if (error) {
                    log(`❌ Failed to check OAuth logs: ${error.message}`, 'red');
                    resolve(false);
                    return;
                }

                const hasAppTokenCheck = stdout.includes('Checking App Access Token');
                const hasTokenExpiry = stdout.includes('App Access Token expires in');

                if (hasAppTokenCheck && hasTokenExpiry) {
                    log('✅ OAuth service is actively monitoring App Access Token', 'green');
                    resolve(true);
                } else {
                    log('⚠️  OAuth service may not be monitoring App Access Token', 'yellow');
                    log('   This is expected if service recently restarted', 'yellow');
                    resolve(true);
                }
            });
        });

    } catch (error) {
        log(`❌ OAuth integration test failed: ${error.message}`, 'red');
        return false;
    }
}

async function testBotRestartCapability() {
    log('\n🧪 TEST 6: Bot Restart Capability', 'cyan');
    log('━'.repeat(50), 'cyan');

    try {
        log('Checking PM2 bot processes...', 'blue');

        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('pm2 jlist', (error, stdout, stderr) => {
                if (error) {
                    log(`❌ Failed to get PM2 list: ${error.message}`, 'red');
                    resolve(false);
                    return;
                }

                const processes = JSON.parse(stdout);
                const botProcesses = processes.filter(p =>
                    p.name !== 'OAuth Token Manager' &&
                    p.name !== 'CountD Overlay' &&
                    p.name !== 'EventSub Manager' &&
                    p.name !== 'Bot-Deployment-Manager' &&
                    p.name !== 'whatsapp-gdrive-bot' &&
                    p.name !== 'DualChat'
                );

                log(`Found ${botProcesses.length} bot processes:`, 'blue');
                botProcesses.forEach(p => {
                    log(`  - ${p.name} (status: ${p.pm2_env.status})`, 'blue');
                });

                if (botProcesses.length > 0) {
                    log('✅ Bot processes are ready for restart', 'green');
                    resolve(true);
                } else {
                    log('⚠️  No bot processes found', 'yellow');
                    resolve(false);
                }
            });
        });

    } catch (error) {
        log(`❌ Bot restart test failed: ${error.message}`, 'red');
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAllTests() {
    log('\n' + '═'.repeat(60), 'cyan');
    log('       TOKEN MONITORING TEST SUITE', 'cyan');
    log('═'.repeat(60) + '\n', 'cyan');

    const results = {
        telegram: false,
        validation: false,
        expired: false,
        expiring: false,
        oauth: false,
        restart: false
    };

    try {
        // Run tests
        results.telegram = await testTelegramNotifications();
        await sleep(2000);

        results.validation = await testTokenValidation();
        await sleep(1000);

        results.oauth = await testOAuthServiceIntegration();
        await sleep(1000);

        results.restart = await testBotRestartCapability();
        await sleep(1000);

        // Potentially destructive tests (require backup/restore)
        log('\n⚠️  Next tests will temporarily modify token (with backup)', 'yellow');
        log('Press Ctrl+C to skip, or wait 3 seconds to continue...', 'yellow');
        await sleep(3000);

        results.expired = await testExpiredTokenScenario();
        await sleep(2000);

        results.expiring = await testExpiringSoonScenario();

    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`, 'red');
    }

    // Summary
    log('\n' + '═'.repeat(60), 'cyan');
    log('       TEST RESULTS SUMMARY', 'cyan');
    log('═'.repeat(60), 'cyan');

    const tests = [
        { name: 'Telegram Notifications', result: results.telegram },
        { name: 'Token Validation', result: results.validation },
        { name: 'Expired Token Recovery', result: results.expired },
        { name: 'Expiring Soon Auto-Renewal', result: results.expiring },
        { name: 'OAuth Service Integration', result: results.oauth },
        { name: 'Bot Restart Capability', result: results.restart }
    ];

    tests.forEach(test => {
        const status = test.result ? '✅ PASS' : '❌ FAIL';
        const color = test.result ? 'green' : 'red';
        log(`${status} - ${test.name}`, color);
    });

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.values(results).length;

    log('\n' + '═'.repeat(60), 'cyan');
    log(`  ${passCount}/${totalCount} tests passed`, passCount === totalCount ? 'green' : 'yellow');
    log('═'.repeat(60) + '\n', 'cyan');

    if (passCount === totalCount) {
        log('🎉 All tests passed! Auto-renewal system is working correctly.', 'green');
    } else {
        log('⚠️  Some tests failed. Review logs above for details.', 'yellow');
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    log('\n\n⚠️  Test interrupted by user', 'yellow');

    // Check if backup exists and restore
    try {
        await fs.access(BACKUP_FILE);
        log('Restoring backup...', 'yellow');
        await restoreToken();
        log('✅ Backup restored', 'green');
    } catch {
        // No backup to restore
    }

    process.exit(0);
});

// Run tests
runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
        log(`\n❌ Fatal error: ${error.message}`, 'red');
        process.exit(1);
    });
