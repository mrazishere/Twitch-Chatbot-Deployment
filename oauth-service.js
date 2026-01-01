require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const port = process.env.OAUTH_PORT || 3001;

// Configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENTID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENTSECRET;
const OAUTH_DOMAIN = process.env.OAUTH_DOMAIN || 'localhost:3001';
const BASE_URL = OAUTH_DOMAIN.startsWith('localhost') ? `http://${OAUTH_DOMAIN}` : `https://${OAUTH_DOMAIN}`;
const REDIRECT_URI = `${BASE_URL}/auth/callback`;
const LOGIN_REDIRECT_URI = `${BASE_URL}/auth/login-callback`;
const BOT_SERVICE_PORT = process.env.BOT_SERVICE_PORT || 3003;
const CHANNELS_DIR = path.join(__dirname, 'channel-configs');

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware (increased limit for audio uploads)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Helper function to get channel config file path
function getChannelConfigPath(channelName) {
    return path.join(CHANNELS_DIR, `${channelName}.json`);
}

// Helper function to load channel config
async function loadChannelConfig(channelName) {
    try {
        const configPath = getChannelConfigPath(channelName);
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

// Helper function to save channel config
async function saveChannelConfig(channelName, config) {
    const configPath = getChannelConfigPath(channelName);

    // Ensure directory exists
    await fs.mkdir(CHANNELS_DIR, { recursive: true });

    // Update lastUpdated timestamp
    config.lastUpdated = new Date().toISOString();

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`Channel config updated: ${channelName}`);
}

// OAuth helper functions
const OAUTH_FILE = path.join(CHANNELS_DIR, 'oauth.json');

async function loadOAuthData() {
    try {
        if (await fs.access(OAUTH_FILE).then(() => true).catch(() => false)) {
            const data = await fs.readFile(OAUTH_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading OAuth data:', error.message);
    }
    
    // Return default structure
    return {
        channels: {},
        lastUpdated: null
    };
}

async function saveOAuthData(oauthData) {
    try {
        // Ensure directory exists
        await fs.mkdir(CHANNELS_DIR, { recursive: true });
        
        oauthData.lastUpdated = new Date().toISOString();
        await fs.writeFile(OAUTH_FILE, JSON.stringify(oauthData, null, 2));
        console.log(`OAuth data updated`);
    } catch (error) {
        console.error('Error saving OAuth data:', error.message);
        throw error;
    }
}

async function getChannelOAuth(channelName) {
    const oauthData = await loadOAuthData();
    return oauthData.channels[channelName] || null;
}

async function setChannelOAuth(channelName, tokenData) {
    const oauthData = await loadOAuthData();
    
    oauthData.channels[channelName] = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        username: tokenData.username,
        user_id: tokenData.user_id,
        display_name: tokenData.display_name,
        created_at: tokenData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    await saveOAuthData(oauthData);
}

async function removeChannelOAuth(channelName) {
    const oauthData = await loadOAuthData();
    
    if (oauthData.channels[channelName]) {
        delete oauthData.channels[channelName];
        await saveOAuthData(oauthData);
    }
}

// App Access Token functions for Chat Bot Badge
const APP_ACCESS_TOKEN_FILE = path.join(CHANNELS_DIR, 'app-access-token.json');

async function loadAppAccessToken() {
    try {
        if (await fs.access(APP_ACCESS_TOKEN_FILE).then(() => true).catch(() => false)) {
            const data = await fs.readFile(APP_ACCESS_TOKEN_FILE, 'utf8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('Error loading App Access Token:', error.message);
        return null;
    }
}

async function saveAppAccessToken(tokenData) {
    try {
        await fs.mkdir(CHANNELS_DIR, { recursive: true });
        tokenData.created_at = tokenData.created_at || new Date().toISOString();
        tokenData.updated_at = new Date().toISOString();
        await fs.writeFile(APP_ACCESS_TOKEN_FILE, JSON.stringify(tokenData, null, 2));
        console.log('App Access Token saved successfully');
    } catch (error) {
        console.error('Error saving App Access Token:', error.message);
        throw error;
    }
}

async function ensureAppAccessToken() {
    try {
        let appToken = await loadAppAccessToken();
        
        // Check if token exists and is not expired
        if (appToken && appToken.access_token) {
            const expiresAt = new Date(appToken.created_at).getTime() + (appToken.expires_in * 1000);
            const isExpired = Date.now() > (expiresAt - 300000); // 5 minute buffer
            
            if (!isExpired) {
                return appToken;
            }
        }
        
        // Generate new App Access Token
        console.log('Generating new App Access Token for Chat Bot Badge...');
        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: '' // App Access Token doesn't need scopes
        });
        
        const tokenData = {
            access_token: response.data.access_token,
            expires_in: response.data.expires_in,
            token_type: response.data.token_type,
            is_app_token: true,
            created_at: new Date().toISOString()
        };
        
        await saveAppAccessToken(tokenData);
        console.log('✅ App Access Token generated successfully for Chat Bot Badge');
        return tokenData;
        
    } catch (error) {
        console.error('❌ Failed to ensure App Access Token:', error.message);
        throw error;
    }
}

// Helper function to send message to Twitch chat via bot
async function sendToTwitchChat(channelName, message) {
    try {
        // Use TMI.js to send message as the bot
        const tmi = require('tmi.js');
        
        const client = new tmi.Client({
            options: { debug: false },
            connection: {
                reconnect: true,
                secure: true
            },
            identity: {
                username: process.env.TWITCH_USERNAME,
                password: process.env.TWITCH_OAUTH
            },
            channels: [channelName]
        });
        
        await client.connect();
        await client.say(channelName, message);
        await client.disconnect();
        
        console.log(`🎤 NODE: Bot sent message to #${channelName}: "${message}"`);
        
    } catch (error) {
        console.error(`🎤 NODE: Failed to send bot message to #${channelName}:`, error.message);
        throw error;
    }
}

// Helper function to generate auth URL for login
function generateLoginAuthUrl() {
    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: LOGIN_REDIRECT_URI,
        response_type: 'code',
        scope: 'user:read:email',
        state: crypto.randomBytes(16).toString('hex')
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

// Helper function to generate OAuth URL for channel authorization
//function generateChannelAuthUrl(channelName, scopes = 'chat:read chat:edit channel:moderate moderator:manage:banned_users channel:read:redemptions') {
function generateChannelAuthUrl(channelName, scopes = 'channel:read:redemptions chat:read channel:bot') {
    // Add timestamp to force fresh authorization
    const timestamp = Date.now();
    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scopes,
        state: `channel_auth:${channelName}:${timestamp}`, // Unique state
        force_verify: 'true' // Force Twitch to show authorization screen
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

// Helper function to get user info from access token
async function getUserInfo(accessToken) {
    const response = await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
        }
    });
    return response.data.data[0];
}

// Routes

// Main dashboard - requires authentication
app.get('/auth', requireAuth, (req, res) => {
    // User is authenticated, show their dashboard
    showUserDashboard(req.session.user.login, res, req.session.user);
});

// Login page
app.get('/auth/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/auth');
    }

    const authUrl = generateLoginAuthUrl();

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Mr-AI-is-Here OAuth Manager</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
                    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    max-width: 700px;
                    margin: 0 auto;
                    background: rgba(30, 30, 45, 0.95);
                    padding: 30px;
                    border-radius: 24px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
                    border: 1px solid rgba(102, 126, 234, 0.2);
                }
                h1 {
                    color: #a5b4fc;
                    text-align: center;
                    margin-bottom: 30px;
                    font-size: 28px;
                    font-weight: 600;
                }
                h2 { color: #e2e8f0; font-size: 22px; margin-bottom: 15px; }
                h3 { color: #a5b4fc; font-size: 18px; margin-bottom: 12px; }
                .login-section {
                    text-align: center;
                    padding: 30px;
                    background: rgba(20, 20, 35, 0.6);
                    border-radius: 16px;
                    margin: 20px 0;
                    border: 1px solid rgba(102, 126, 234, 0.3);
                }
                .login-section p { color: #cbd5e1; margin: 15px 0 25px; line-height: 1.6; }
                .auth-btn {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 16px 32px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    border-radius: 12px;
                    text-decoration: none;
                    display: inline-block;
                    width: 100%;
                    max-width: 350px;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                }
                .auth-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
                }
                .info {
                    background: rgba(20, 20, 35, 0.5);
                    padding: 20px;
                    border-radius: 12px;
                    margin: 20px 0;
                    border: 1px solid rgba(102, 126, 234, 0.2);
                    color: #e2e8f0;
                }
                .info ul { padding-left: 24px; line-height: 1.8; margin-top: 10px; }
                .info li { margin: 8px 0; }
                .security-note {
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
                    padding: 20px;
                    border-radius: 12px;
                    margin: 20px 0;
                    border-left: 4px solid #10b981;
                    color: #e2e8f0;
                }
                .security-note h3 { color: #10b981; }
                .security-note ul { padding-left: 24px; line-height: 1.8; margin-top: 10px; }
                .security-note li { margin: 8px 0; }

                /* Mobile responsive */
                @media (max-width: 768px) {
                    body { padding: 10px; }
                    .container { padding: 20px; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    h2 { font-size: 20px; }
                    .login-section { padding: 20px; }
                    .auth-btn { padding: 14px 24px; max-width: 100%; }
                    .info, .security-note { padding: 15px; font-size: 14px; }
                    ul { padding-left: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Mr-AI-is-Here OAuth Manager</h1>

                <div class="login-section">
                    <h2>👋 Welcome!</h2>
                    <p>To manage your channel's Mr-AI-is-Here bot tokens, please sign in with your Twitch account.</p>
                    <a href="${authUrl}" class="auth-btn">🔐 Sign in with Twitch</a>
                </div>

                <div class="security-note">
                    <h3>🔒 Secure Access</h3>
                    <ul>
                        <li>✅ You can only manage OAuth tokens for your own channel</li>
                        <li>✅ Your session is encrypted and secure</li>
                        <li>✅ Only you can see and control your channel's bot permissions</li>
                    </ul>
                </div>

                <div class="info">
                    <h3>📝 What This Does</h3>
                    <ul>
                        <li>Generate OAuth tokens for Mr-AI-is-Here bot to operate in your channel</li>
                        <li>Manage bot permissions and token expiration</li>
                        <li>Revoke bot access when needed</li>
                        <li>Enable channel point redemption features</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Login callback
app.get('/auth/login-callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.status(400).send(`
            <h1>❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <a href="/auth/login">Try Again</a>
        `);
    }

    try {
        // Exchange code for token to get user info
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: LOGIN_REDIRECT_URI
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const userInfo = await getUserInfo(tokenResponse.data.access_token);

        // Store user in session
        req.session.user = {
            login: userInfo.login,
            display_name: userInfo.display_name,
            id: userInfo.id,
            email: userInfo.email,
            authenticated_at: new Date().toISOString()
        };

        // Redirect to their dashboard
        res.redirect('/auth');

    } catch (err) {
        console.error('Login failed:', err.response?.data || err.message);
        res.status(500).send(`
            <h1>❌ Authentication Error</h1>
            <p>Failed to verify your identity. Please try again.</p>
            <a href="/auth/login">Back to Login</a>
        `);
    }
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/auth/login');
    });
});

// Function to create default channel config
async function createDefaultChannelConfig(username) {
    const defaultConfig = {
        channelName: username,
        chatOnly: false,
        moderationEnabled: true,
        oauthToken: "oauth:pending_oauth_generation",
        clientId: TWITCH_CLIENT_ID,
        moderatorUsername: process.env.TWITCH_USERNAME,
        lastUpdated: new Date().toISOString(),
        redemptionEnabled: true,
        redemptionRewardId: "",
        redemptionTimeoutDuration: 60
    };

    await saveChannelConfig(username, defaultConfig);
    console.log(`Created default channel config for: ${username}`);
    return defaultConfig;
}

// Function to show user's personal dashboard (SECURE - only shows their own data)
async function showUserDashboard(username, res, userSession) {
    try {
        let config = await loadChannelConfig(username);
        let isNewChannel = false;

        // If no config exists, create a default one
        if (!config) {
            config = await createDefaultChannelConfig(username);
            isNewChannel = true;
        }

        let actions = '';

        // Welcome message for new channels
        let welcomeMessage = '';
        if (isNewChannel) {
            welcomeMessage = `
                <div class="welcome-message">
                    <h3>🎉 Welcome to Mr-AI-is-Here Bot!</h3>
                    <p>We've automatically created a configuration for your channel <strong>${username}</strong>.</p>
                    <p>Click "Generate OAuth Token" below to give Mr-AI-is-Here bot permission to operate in your channel.</p>
                </div>
            `;
        }

        // Check OAuth status
        let oauthStatus = '❌ No OAuth Token';
        let oauthDetails = '';

        // Check OAuth status from separate oauth.json file
        const oauthData = await getChannelOAuth(username);

        if (oauthData && oauthData.access_token) {
            try {
                const validateResponse = await axios.get('https://id.twitch.tv/oauth2/validate', {
                    headers: { 'Authorization': `Bearer ${oauthData.access_token}` }
                });

                oauthStatus = '✅ OAuth Active';
                oauthDetails = `
                    <p><strong>Token expires in:</strong> ${Math.floor(validateResponse.data.expires_in / 3600)} hours</p>
                    <p><strong>Scopes:</strong> ${validateResponse.data.scopes.join(', ')}</p>
                    <p><strong>Last updated:</strong> ${new Date(oauthData.updated_at).toLocaleString()}</p>
                `;

                actions = `
    <button class="btn-success" onclick="window.location.href = '/auth/refresh'">🔄 Refresh Token</button>
    <button class="btn-primary" onclick="window.location.href = '/auth/generate'">🔐 Re-authenticate</button>
    <button class="btn-danger" onclick="window.location.href = '/auth/revoke'">🗑️ Revoke Access</button>
`;

            } catch (error) {
                if (error.response?.status === 401) {
                    oauthStatus = '⚠️ OAuth Token Expired';
                    oauthDetails = `
                        <p><strong>Last updated:</strong> ${new Date(oauthData.updated_at).toLocaleString()}</p>
                        <p style="color: #f59e0b;">Your OAuth token has expired and needs to be refreshed or regenerated.</p>
                    `;

                    actions = `
    <button class="btn-warning" onclick="window.location.href = '/auth/refresh'">🔄 Try Refresh</button>
    <button class="btn-primary" onclick="window.location.href = '/auth/generate'">🔐 Re-authenticate</button>
    <button class="btn-danger" onclick="window.location.href = '/auth/revoke'">🗑️ Remove Token</button>
`;
                }
            }
        } else {
            actions = `
    <button class="btn-primary" onclick="window.location.href = '/auth/generate'">🔐 Generate OAuth Token</button>
`;
        }

        const channelStatus = `
            <div class="channel-status">
                <h3>📋 Your Channel Status</h3>
                <p><strong>Channel:</strong> ${config.channelName || username}</p>
                <p><strong>Moderation Enabled:</strong> ${config.moderationEnabled ? 'Yes' : 'No'}</p>
                <p><strong>Chat Only Mode:</strong> ${config.chatOnly ? 'Yes' : 'No'}</p>
                <p><strong>Redemptions Enabled:</strong> ${config.redemptionEnabled ? 'Yes' : 'No'}</p>
                <p><strong>OAuth Status:</strong> ${oauthStatus}</p>
                ${oauthDetails}
            </div>
        `;

        // Check if user is the bot owner
        const botOwnerUsername = process.env.TWITCH_USERNAME;
        const isBotOwner = username.toLowerCase() === botOwnerUsername.toLowerCase();
        const botTokenLink = isBotOwner ? '<a href="/auth/bot-token">🔧 Bot Token Manager</a> |' : '';

        // Load template
        const templatePath = path.join(__dirname, 'views', 'dashboard.html');
        let html = await fs.readFile(templatePath, 'utf8');

        // Replace placeholders
        html = html.replace(/{{USERNAME}}/g, username);
        html = html.replace(/{{DISPLAY_NAME}}/g, userSession.display_name);
        html = html.replace(/{{LOGIN}}/g, userSession.login);
        html = html.replace(/{{EMAIL}}/g, userSession.email || 'Not provided');
        html = html.replace(/{{SESSION_TIME}}/g, new Date(userSession.authenticated_at).toLocaleString());
        html = html.replace(/{{WELCOME_MESSAGE}}/g, welcomeMessage);
        html = html.replace(/{{CHANNEL_STATUS}}/g, channelStatus);
        html = html.replace(/{{ACTIONS}}/g, actions);
        html = html.replace(/{{MODERATION_STATUS}}/g, config.moderationEnabled ? 'Enabled' : 'Disabled');
        html = html.replace(/{{CHAT_ONLY_STATUS}}/g, config.chatOnly ? 'Enabled' : 'Disabled');
        html = html.replace(/{{REDEMPTION_STATUS}}/g, config.redemptionEnabled ? 'Enabled' : 'Disabled');
        html = html.replace(/{{BOT_TOKEN_LINK}}/g, botTokenLink);

        res.send(html);

    } catch (error) {
        res.status(500).send(`
            <h1>❌ Error Loading Dashboard</h1>
            <p>Failed to load dashboard for ${username}: ${error.message}</p>
            <a href="/auth">Back to Dashboard</a>
        `);
    }
}

// Generate OAuth for specific channel (SECURE - only for authenticated user's channel)
app.get('/auth/generate', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    // Check if channel config exists, create if not
    let config = await loadChannelConfig(username);
    if (!config) {
        config = await createDefaultChannelConfig(username);
    }

    //const scopes = req.query.scopes || 'chat:read chat:edit channel:moderate moderator:manage:banned_users channel:read:redemptions';
    const scopes = req.query.scopes || 'chat:read channel:read:redemptions channel:bot';
    const authUrl = generateChannelAuthUrl(username, scopes);

    console.log(`Starting OAuth flow for authenticated user: ${username}`);
    res.redirect(authUrl);
});

// OAuth callback for channel authorization (SECURE)
app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        console.error('OAuth authorization failed:', error);
        return res.redirect(`/auth?error=${encodeURIComponent(error)}`);
    }

    if (!state || !state.startsWith('channel_auth:')) {
        return res.redirect('/auth?error=Invalid+request');
    }

    const stateParts = state.split(':');
    const channelName = stateParts[1]; // Extract just the channel name

    try {
        // Load existing channel config
        const config = await loadChannelConfig(channelName);
        if (!config) {
            return res.redirect('/auth?error=Channel+not+found');
        }

        // Exchange authorization code for access token
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const tokenData = tokenResponse.data;
        const userInfo = await getUserInfo(tokenData.access_token);

        // SECURITY: Verify the authenticating user matches the channel
        if (userInfo.login.toLowerCase() !== channelName.toLowerCase()) {
            return res.redirect('/auth?error=Access+denied+-+channel+mismatch');
        }

        // Save OAuth data to separate oauth.json file
        await setChannelOAuth(channelName, {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            scope: tokenData.scope,
            token_type: tokenData.token_type,
            username: userInfo.login,
            user_id: userInfo.id,
            display_name: userInfo.display_name,
            created_at: new Date().toISOString()
        });

        // Save channel config (without OAuth data)
        await saveChannelConfig(channelName, config);

        // Trigger EventSub reconnection for newly generated tokens
        const tokenRenewalService = new TokenRenewalService();
        await tokenRenewalService.triggerEventSubReconnections([channelName]);

        console.log(`✅ OAuth tokens generated successfully for ${channelName}`);
        res.redirect('/auth?generated=true');

    } catch (err) {
        console.error('Token exchange failed:', err.response?.data || err.message);
        res.redirect(`/auth?error=${encodeURIComponent('Token generation failed: ' + err.message)}`);
    }
});

// OAuth status page (SECURE - user can only view their own channel)
// Redirect status to dashboard (status info already shown there)
app.get('/auth/status', requireAuth, (req, res) => {
    res.redirect('/auth');
});

// Refresh OAuth token (SECURE - user can only refresh their own)
app.get('/auth/refresh', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    try {
        const config = await loadChannelConfig(username);
        const oauthData = await getChannelOAuth(username);

        if (!config || !oauthData || !oauthData.refresh_token) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(404).json({ success: false, error: 'No refresh token found' });
            }
            return res.status(404).send(`
                <h1>❌ Refresh Failed</h1>
                <p>No refresh token found for your channel: ${username}</p>
                <a href="/auth/generate">Generate New OAuth</a> |
                <a href="/auth">Back to Dashboard</a>
            `);
        }

        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            grant_type: 'refresh_token',
            refresh_token: oauthData.refresh_token,
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Update OAuth data with new tokens
        await setChannelOAuth(username, {
            ...oauthData,
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_in: response.data.expires_in
        });

        console.log(`OAuth token refreshed successfully for channel: ${username}`);

        // Trigger EventSub reconnection for manually refreshed channel
        const tokenRenewalService = new TokenRenewalService();
        await tokenRenewalService.triggerEventSubReconnections([username]);

        res.redirect('/auth?refreshed=true');

    } catch (error) {
        console.error(`OAuth refresh failed for ${username}:`, error.response?.data || error.message);
        const errorMsg = error.response?.data?.message || error.message;
        res.redirect('/auth?error=' + encodeURIComponent('Refresh failed: ' + errorMsg));
    }
});

// Revoke OAuth token (SECURE - user can only revoke their own)
app.get('/auth/revoke', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    try {
        const config = await loadChannelConfig(username);
        const oauthData = await getChannelOAuth(username);

        if (!config || !oauthData || !oauthData.access_token) {
            return res.redirect('/auth?error=' + encodeURIComponent('No token found to revoke'));
        }

        // Revoke token with Twitch
        await axios.post('https://id.twitch.tv/oauth2/revoke', {
            client_id: TWITCH_CLIENT_ID,
            token: oauthData.access_token
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Remove OAuth data from oauth.json
        await removeChannelOAuth(username);

        // Also disable redemptions in channel config to stop EventSub attempts
        if (config) {
            config.redemptionEnabled = false;
            config.redemptionRewardId = null;
            await saveChannelConfig(username, config);
            console.log(`Disabled redemptions for ${username} after token revocation`);
        }

        console.log(`OAuth token revoked successfully for channel: ${username}`);

        // Trigger EventSub disconnection for revoked channel
        // (This will attempt reconnection but fail due to invalid token, effectively disconnecting)
        const tokenRenewalService = new TokenRenewalService();
        await tokenRenewalService.triggerEventSubReconnections([username]);

        res.redirect('/auth?revoked=true');

    } catch (error) {
        console.error(`OAuth revocation failed for ${username}:`, error.response?.data || error.message);
        res.redirect('/auth?error=' + encodeURIComponent('Revoke failed: ' + (error.response?.data?.message || error.message)));
    }
});

// SECURITY: Validate channel name to prevent path traversal attacks
function validateChannelName(channelName) {
    if (!channelName || typeof channelName !== 'string') {
        return false;
    }

    // Block obvious path traversal attempts
    if (channelName.includes('..') || channelName.includes('/') || channelName.includes('\\') || channelName.includes('\0')) {
        return false;
    }

    // Allow reasonable channel name lengths (preserve existing functionality)
    if (channelName.length > 100) {
        return false;
    }

    return true;
}

// API endpoint to get OAuth token for bot use (unchanged - this stays the same for bot access)
app.get('/auth/token', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) {
        return res.status(400).json({ error: 'Channel parameter is required' });
    }

    // SECURITY: Validate channel parameter to prevent path traversal
    if (!validateChannelName(channel)) {
        return res.status(400).json({ error: 'Invalid channel name format' });
    }

    try {
        const config = await loadChannelConfig(channel);

        if (!config) {
            return res.status(404).json({ error: `No config found for channel: ${channel}` });
        }

        // Get OAuth data from separate file
        const oauthData = await getChannelOAuth(channel);
        
        if (!oauthData || !oauthData.access_token) {
            return res.status(404).json({ error: `No OAuth token found for channel: ${channel}` });
        }

        // Validate token
        try {
            const validateResponse = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `Bearer ${oauthData.access_token}` }
            });

            res.json({
                access_token: oauthData.access_token,
                expires_in: validateResponse.data.expires_in,
                username: oauthData.username,
                channel: channel
            });

        } catch (validationError) {
            if (validationError.response?.status === 401) {
                // Try to refresh token automatically
                if (oauthData.refresh_token) {
                    try {
                        const refreshResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
                            grant_type: 'refresh_token',
                            refresh_token: oauthData.refresh_token,
                            client_id: TWITCH_CLIENT_ID,
                            client_secret: TWITCH_CLIENT_SECRET
                        }, {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        });

                        // Update OAuth data with new tokens
                        await setChannelOAuth(channel, {
                            ...oauthData,
                            access_token: refreshResponse.data.access_token,
                            refresh_token: refreshResponse.data.refresh_token,
                            expires_in: refreshResponse.data.expires_in
                        });

                        console.log(`Auto-refreshed OAuth token for channel: ${channel}`);
                        
                        // Trigger EventSub reconnection for auto-refreshed channel
                        const tokenRenewalService = new TokenRenewalService();
                        await tokenRenewalService.triggerEventSubReconnections([channel]);

                        res.json({
                            access_token: refreshResponse.data.access_token,
                            expires_in: refreshResponse.data.expires_in,
                            username: oauthData.username,
                            channel: channel,
                            refreshed: true
                        });

                    } catch (refreshError) {
                        console.error(`OAuth refresh failed for ${channel}:`, refreshError.response?.data || refreshError.message);
                        res.status(401).json({
                            error: `OAuth token expired and refresh failed for channel: ${channel}. Re-authentication required.`
                        });
                    }
                } else {
                    res.status(401).json({
                        error: `OAuth token expired and no refresh token available for channel: ${channel}. Re-authentication required.`
                    });
                }
            } else {
                throw validationError;
            }
        }

    } catch (error) {
        console.error(`Error getting OAuth token for ${channel}:`, error.message);
        res.status(500).json({
            error: 'Failed to get OAuth token',
            channel: channel,
            details: error.message
        });
    }
});

// Claude Voice Trigger Interface (SECURE - only for authenticated users)
app.get('/auth/claude', requireAuth, async (req, res) => {
    try {
        const username = req.session.user.login;
        const templatePath = path.join(__dirname, 'views', 'claude-interface.html');
        const template = await fs.readFile(templatePath, 'utf8');
        const html = template.replace(/\{\{USERNAME\}\}/g, username);
        res.send(html);
    } catch (error) {
        console.error('Error loading Claude interface:', error);
        res.status(500).send('Error loading Claude interface');
    }
});

// Claude API endpoint for voice trigger (SECURE - only for authenticated users)
app.post('/auth/api/claude', requireAuth, async (req, res) => {
    const username = req.session.user.login;
    const { prompt } = req.body;

    console.log('🎤 NODE: Claude API request from', username);
    console.log('🎤 NODE: Prompt received:', '"' + prompt + '"');
    console.log('🎤 NODE: Prompt length:', prompt ? prompt.length : 0);

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        console.log('🎤 NODE: Invalid prompt - returning error');
        return res.status(400).json({ success: false, error: 'Invalid prompt' });
    }

    if (prompt.length > 2000) {
        console.log('🎤 NODE: Prompt too long - returning error');
        return res.status(400).json({ success: false, error: 'Prompt too long (max 2000 characters)' });
    }

    try {
        // Load the Claude command function
        const claudeCommand = require('./bot-commands/claude.js');

        // Create a client that captures response AND sends to Twitch chat
        let claudeResponseParts = [];
        
        const mockClient = {
            say: async (channel, message) => {
                // Extract the actual response (remove @username prefix/suffix)
                const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Handle both "@username, message" and "message @username" formats
                let cleanMessage;
                const prefixMatch = message.match(new RegExp(`^@${escapedUsername},\\s*(.+)$`));
                const suffixMatch = message.match(new RegExp(`^(.+?)\\s*@${escapedUsername}$`));
                
                if (prefixMatch) {
                    cleanMessage = prefixMatch[1].trim();
                } else if (suffixMatch) {
                    cleanMessage = suffixMatch[1].trim();
                } else {
                    // Fallback: remove any @mentions
                    cleanMessage = message.replace(/@\w+,?\s*/g, '').trim();
                }
                
                // Also send to real Twitch chat as the bot (include prompt for first part only)
                try {
                    let chatMessage;
                    if (claudeResponseParts.length === 0) {
                        // First part - include the prompt
                        chatMessage = `Q: "${prompt}" A: ${cleanMessage}`;
                    } else {
                        // Additional parts - just the response
                        chatMessage = cleanMessage;
                    }
                    
                    console.log('🎤 NODE: Sending Claude response part to Twitch chat:', username);
                    await sendToTwitchChat(username, chatMessage);
                } catch (error) {
                    console.log('🎤 NODE: Failed to send to Twitch chat:', error.message);
                }
                
                // Collect all parts of the response
                claudeResponseParts.push(cleanMessage);
                console.log('🎤 NODE: Captured Claude response part:', '"' + cleanMessage + '"');
            }
        };

        // Mock tags object
        const mockTags = {
            username: username,
            badges: { broadcaster: '1' }, // Give broadcaster privileges
            isSubscriber: true
        };

        // Call Claude with the prompt
        const claudeMessage = `!claude ${prompt}`;
        await claudeCommand.claude(mockClient, claudeMessage, username, mockTags, {});

        // Wait for Claude response (takes ~3 seconds)
        console.log('🎤 NODE: Waiting for Claude response...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for response

        if (claudeResponseParts.length > 0) {
            // Combine all parts of the response
            const fullResponse = claudeResponseParts.join(' ');
            console.log('🎤 NODE: Claude responded successfully');
            console.log('🎤 NODE: Response parts captured:', claudeResponseParts.length);
            console.log('🎤 NODE: Full Claude response:', '"' + fullResponse + '"');
            console.log('🎤 NODE: Response length:', fullResponse.length);
            res.json({ success: true, response: fullResponse });
        } else {
            console.log('🎤 NODE: No response from Claude - error');
            res.status(500).json({ success: false, error: 'No response from Claude' });
        }

    } catch (error) {
        console.error('🎤 NODE: Claude API error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// AI Text-to-Speech API endpoint (SECURE - only for authenticated users)
app.post('/auth/api/tts', requireAuth, async (req, res) => {
    const { text, voice_id, volume } = req.body;

    console.log('🎤 NODE: TTS API request');
    console.log('🎤 NODE: TTS text:', '"' + text + '"');
    console.log('🎤 NODE: TTS voice_id:', voice_id);
    console.log('🎤 NODE: TTS volume:', volume);

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.log('🎤 NODE: TTS invalid text - returning error');
        return res.status(400).json({ success: false, error: 'Invalid text' });
    }

    if (text.length > 5000) {
        console.log('🎤 NODE: TTS text too long - returning error');
        return res.status(400).json({ success: false, error: 'Text too long (max 5000 characters)' });
    }

    try {
        // Voice mapping for realistic AI voices
        const voiceMap = {
            'rachel': 'en-US-AriaNeural',
            'josh': 'en-US-GuyNeural',
            'arnold': 'en-US-DavisNeural',
            'bella': 'en-US-AmberNeural',
            'callum': 'en-GB-RyanNeural',
            'charlotte': 'en-GB-SoniaNeural',
            'matilda': 'en-AU-NatashaNeural'
        };

        const azureVoice = voiceMap[voice_id] || 'en-US-AriaNeural';

        // Voice mapping for fallback browser TTS

        // Use TTS Monster for premium AI voices  
        if (process.env.TTSMONSTER_API_KEY) {
            // TTS Monster voice mapping (alphabetically sorted, filtered list)
            const ttsMonsterVoiceMap = {
                'akari': '32a369aa-5485-4039-beb6-4c757e93a197', // Akari - Japanese Female
                'alpha': '98800f7e-05bf-4064-a8d2-cd12ee18496c', // Alpha - EN-US Male
                'atlas': 'c4ad44ae-8da9-4375-90c0-55a1e6f1fbc6', // Atlas - EN-US Male
                'aurora': '148c554a-f58d-4ed3-8395-a67f86d00501', // Aurora - EN-US Female
                'axel': '24e1a8ff-e5c7-464f-a708-c4fe92c59b28', // Axel - EN-US Male
                'blitz': '84cd0ca2-8b98-4fb7-9365-1c76965724d9', // Blitz - EN-US Male
                'breaker': 'd1179775-d73d-46f4-ab12-bced0baf9cd2', // Breaker - EN-US Male
                'breeze': '1aa9d694-1da5-4bdb-8e07-6392ec526c2f', // Breeze - EN-US Female
                'brian': '0993f688-6719-4cf6-9769-fee7b77b1df5', // Brian Robot - EN-US Male
                'chef': '01f69a26-0759-44e4-b317-cdbcb26b26c0', // Chef - EN-US Male
                'circuit': 'e8a18685-00fd-4798-aa3d-50424f8de7e6', // Circuit - EN-US Male
                'commander': 'ff076c08-31e5-43ad-9d9a-7d9c2e5a34be', // Commander - EN-US Male
                'czar': '4a995df1-5462-444c-a070-90c1d75884f6', // Czar - Russian Male
                'dash': 'd2f70685-fbe3-4ca0-b0fd-cfb24f7e0c48', // Dash - EN-US Male
                'debater': 'a0741f38-b14a-4204-a26e-80f795f03637', // Debater - EN-US Male
                'diplomat': '49826b97-091a-4821-a978-15692387647a', // Diplomat - EN-US Male
                'elder': 'e0f1c6e2-fbb2-4df4-9ec2-f1109371ab1e', // Elder - EN-US Male
                'explorer': '7dfab21a-da07-4474-b7df-dcbbd7c7c69c', // Explorer - EN-US Male
                'forge': '5161b27a-3c2a-4886-9c58-ef96cef0c022', // Forge - EN-US Male
                'frogman': '47906020-29e9-4903-91e3-8b66b0528410', // Frogman - EN-US Male
                'frost': '314df8f9-d157-4bb7-b744-0172e2fb8a32', // Frost - EN-US Male
                'gravel': '8312e7dd-cb15-4d9f-9d51-035209413b7a', // Gravel - EN-US Male
                'hunter': 'c5d9224a-60d1-48db-9dfd-3146842a931c', // Hunter - EN-US Male
                'inferno': '5b694acf-1513-427a-b920-6a68dcf15184', // Inferno - EN-US Male
                'ironclad': 'd421ea19-2263-47d3-a3e7-34ad8b2c5444', // Ironclad - EN-US Male
                'kawaii': '604168da-f156-450b-8794-e89175abdcd4', // Kawaii - EN-US Female
                'leader': '9af5e3d0-b4b2-44eb-9580-849d8d36a30e', // Leader - EN-US Male
                'mentor': '5dbb63c3-1179-4704-90cf-8dbe0d9b33ab', // Mentor - EN-US Male
                'merlin': '26c9f68f-a1bd-4871-a76c-6eee020c5b07', // Merlin - French Male
                'micro': '8153e703-4cfb-4716-8a92-ba19cc7f0228', // Micro - EN-US Male
                'pablo': '050fc1b3-28be-4461-9977-b8b087f02dad', // Pablo - Spanish Male
                'pulse': 'a5879188-842e-4971-a281-eae9791e2138', // Pulse - EN-US Male Unstable
                'reasonable': 'c6698522-40c8-453b-8027-fdff52299a57', // Reasonable - EN-US Male
                'scout': '66141f9a-2e93-4d95-ae09-86c7b677c5ae', // Scout - EN-US Male
                'sentient': '2a18e91b-3050-4e7c-b150-c61eb7b8e34e', // Sentient - EN-US Male
                'sentinel': '105e3e7d-ec3e-47a3-a3d3-86345feed23d', // Sentinel - EN-US Male
                'shade': '1de3db1e-a4aa-4103-b399-ba6c1f1f95db', // Shade - EN-US Male
                'spectral': '4b6941d0-0d79-424a-8c66-10c2942293dc', // Spectral - EN-US Male
                'spongey': 'faa92dd8-0517-49da-8f01-1fb03f0e0096', // Spongey - EN-US Male Unstable
                'star': '7e0ee786-b660-47ce-8de7-02fd49698efc', // Star - EN-US Male
                'tentacle': '7cbd44df-08ac-4234-bc95-836e0ae6b22c', // Tentacle - EN-US Male
                'titan': '87537bb9-71e1-481a-87fc-5ffc805a152b', // Titan - EN-US Male
                'titanus': '923bc018-ccd0-4fc7-9642-0cb7ef6dddc5', // Titanus - EN-US Male
                'tycoon': '1948c544-0eab-4408-9259-567b5b2059a4', // Tycoon - EN-US Male
                'vera': '8393d2bc-88d4-4fd1-a4ac-074b4bae94ba', // Vera - EN-US Female
                'verdant': '5fca4739-1d90-4ebe-acc3-dc542028ef58', // Verdant - EN-US Male
                'vice': '1ee26ef6-b745-4adb-8e47-e81956194b13', // Vice - EN-US Male
                'warden': '43c6b437-caf9-4ae9-a0e4-208deea2088e', // Warden - EN-US Male
                'whisper': 'a33aa2c5-47f9-4882-a192-d7aa6a0c0efd', // Whisper - EN-US Male
                'wretch': '61140e69-6cfc-470f-bb91-ad9afbc71092', // Wretch - EN-US Male
                'yuki': '68bc5eb0-fa1f-4d9b-b0bc-89f51edf5fb0' // Yuki - Japanese Female
            };

            const ttsMonsterVoiceId = ttsMonsterVoiceMap[voice_id] || ttsMonsterVoiceMap['circuit'];

            console.log('🎤 NODE: Using TTS Monster API with voice:', ttsMonsterVoiceId);
            
            // First, get the TTS URL from TTS Monster
            const ttsResponse = await fetch('https://api.console.tts.monster/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': process.env.TTSMONSTER_API_KEY
                },
                body: JSON.stringify({
                    voice_id: ttsMonsterVoiceId,
                    message: text,
                    return_usage: true
                })
            });

            if (ttsResponse.ok) {
                const ttsData = await ttsResponse.json();
                if (ttsData.url) {
                    console.log('🎤 NODE: TTS Monster generated audio URL:', ttsData.url);
                    console.log('🎤 NODE: Character usage:', ttsData.characterUsage || 'Unknown');
                    
                    // Return the TTS Monster URL directly for browser to play
                    res.json({
                        success: true,
                        audioUrl: ttsData.url,
                        provider: 'tts-monster',
                        characterUsage: ttsData.characterUsage
                    });
                    return;
                } else {
                    console.log('🎤 NODE: TTS Monster response missing URL:', ttsData);
                }
            } else {
                console.log('🎤 NODE: TTS Monster API failed, status:', ttsResponse.status);
                const errorData = await ttsResponse.text();
                console.log('🎤 NODE: TTS Monster error:', errorData);
            }
        }

        // Fallback to browser-based TTS with better quality settings
        console.log('🎤 NODE: Falling back to browser TTS with voice:', azureVoice);
        res.json({
            success: false,
            fallback: 'browser',
            voice_settings: {
                voice_name: azureVoice,
                rate: 0.85,
                pitch: 1.0,
                volume: parseFloat(volume || 0.8)
            }
        });

    } catch (error) {
        console.error('🎤 NODE: TTS API error:', error);
        res.status(500).json({ success: false, error: 'TTS service unavailable' });
    }
});

// OpenAI Whisper Speech-to-Text API endpoint (SECURE - only for authenticated users)
app.post('/auth/api/whisper', requireAuth, async (req, res) => {
    const { audio } = req.body;

    console.log('🎤 NODE: Whisper STT API request from', req.session.user.login);

    // Validate input - expect base64 encoded audio
    if (!audio || typeof audio !== 'string') {
        console.log('🎤 NODE: Whisper invalid audio data - returning error');
        return res.status(400).json({ success: false, error: 'Invalid audio data' });
    }

    try {
        const FormData = require('form-data');

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audio, 'base64');
        console.log('🎤 NODE: Audio buffer size:', audioBuffer.length, 'bytes');

        // Create form data for OpenAI API
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        // Send to OpenAI Whisper API
        console.log('🎤 NODE: Sending audio to OpenAI Whisper...');
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': `Bearer ${process.env.API_OPENAI_KEY}`,
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        const transcription = response.data.text;
        console.log('🎤 NODE: Whisper transcription:', '"' + transcription + '"');

        res.json({ success: true, text: transcription });

    } catch (error) {
        console.error('🎤 NODE: Whisper API error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'Speech recognition failed',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// Get all channels with OAuth status (API endpoint for bot admin use)
app.get('/auth/channels', async (req, res) => {
    try {
        const files = await fs.readdir(CHANNELS_DIR);
        const channels = files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));

        const channelsStatus = {};

        for (const channel of channels) {
            const config = await loadChannelConfig(channel);
            channelsStatus[channel] = {
                channelName: config?.channelName || channel,
                moderatorUsername: config?.moderatorUsername || 'Unknown',
                moderationEnabled: config?.moderationEnabled || false,
                chatOnly: config?.chatOnly || false,
                redemptionEnabled: config?.redemptionEnabled || false,
                lastUpdated: config?.lastUpdated,
                hasOAuth: !!(config?.oauth?.access_token),
                oauthUsername: config?.oauth?.username,
                oauthCreated: config?.oauth?.created_at,
                oauthUpdated: config?.oauth?.updated_at
            };
        }

        res.json(channelsStatus);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({});
        } else {
            res.status(500).json({ error: 'Failed to load channels', details: error.message });
        }
    }
});

// Export helper functions for use in other files
module.exports = { loadChannelConfig, saveChannelConfig };

// Auto-renewal service (unchanged)
const RENEWAL_CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes
const RENEWAL_THRESHOLD = 30 * 60; // Renew if less than 30 minutes remaining

class TokenRenewalService {
    constructor() {
        this.intervalId = null;
    }

    start() {
        console.log('Starting token auto-renewal service...');
        this.intervalId = setInterval(() => {
            this.checkAndRenewTokens();
        }, RENEWAL_CHECK_INTERVAL);

        // Run initial check
        this.checkAndRenewTokens();
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Token auto-renewal service stopped');
        }
    }

    async checkAndRenewTokens() {
        try {
            console.log('Checking tokens for auto-renewal...');

            // Load OAuth data from separate oauth.json file
            const oauthData = await loadOAuthData();
            if (!oauthData?.channels) {
                console.log('No OAuth data found, skipping renewal check');
                return;
            }

            const channels = Object.keys(oauthData.channels);
            let renewedCount = 0;
            let checkedCount = 0;
            const renewedChannels = [];

            for (const channel of channels) {
                try {
                    const channelOAuth = oauthData.channels[channel];

                    if (!channelOAuth?.access_token) {
                        continue;
                    }

                    checkedCount++;

                    const shouldRenew = await this.shouldRenewToken(channelOAuth.access_token);

                    if (shouldRenew) {
                        console.log(`Auto-renewing token for channel: ${channel}`);
                        const renewed = await this.renewToken(channel, channelOAuth);

                        if (renewed) {
                            renewedCount++;
                            renewedChannels.push(channel);
                            console.log(`✅ Auto-renewed token for ${channel}`);
                        } else {
                            console.log(`❌ Failed to auto-renew token for ${channel}`);
                        }
                    }

                } catch (error) {
                    console.error(`Error checking token for ${channel}:`, error.message);
                }
            }

            if (renewedCount > 0) {
                console.log(`Auto-renewal complete: ${renewedCount}/${checkedCount} tokens renewed`);
                
                // Trigger EventSub reconnections for renewed channels
                await this.triggerEventSubReconnections(renewedChannels);
            } else if (checkedCount > 0) {
                console.log(`Auto-renewal check complete: ${checkedCount} tokens checked, none needed renewal`);
            }

        } catch (error) {
            console.error('Error in token auto-renewal service:', error.message);
        }
    }

    async shouldRenewToken(accessToken) {
        try {
            const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const expiresIn = response.data.expires_in;
            return expiresIn <= RENEWAL_THRESHOLD;

        } catch (error) {
            if (error.response?.status === 401) {
                return true;
            }
            console.error('Error validating token:', error.message);
            return false;
        }
    }

    async renewToken(channelName, channelOAuth) {
        try {
            if (!channelOAuth.refresh_token) {
                console.log(`No refresh token available for ${channelName}`);
                return false;
            }

            const response = await axios.post('https://id.twitch.tv/oauth2/token', {
                grant_type: 'refresh_token',
                refresh_token: channelOAuth.refresh_token,
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET
            }, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            // Update OAuth data in separate oauth.json file
            await setChannelOAuth(channelName, {
                ...channelOAuth,
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in,
                updated_at: new Date().toISOString()
            });

            return true;

        } catch (error) {
            console.error(`Failed to auto-renew token for ${channelName}:`, error.response?.data || error.message);
            return false;
        }
    }

    async triggerEventSubReconnections(renewedChannels) {
        if (renewedChannels.length === 0) return;

        console.log(`🔄 Triggering EventSub reconnections for channels: ${renewedChannels.join(', ')}`);
        
        // Call EventSub service to trigger reconnections
        try {
            const response = await axios.post(`http://localhost:${BOT_SERVICE_PORT}/reconnect`, {
                channels: renewedChannels
            }, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.status === 200) {
                console.log(`✅ Successfully triggered EventSub reconnections for: ${renewedChannels.join(', ')}`);
                
                // Log individual results
                const results = response.data.results;
                for (const [channel, result] of Object.entries(results)) {
                    if (result.success) {
                        console.log(`  ✅ ${channel}: EventSub reconnected successfully`);
                    } else {
                        console.log(`  ❌ ${channel}: EventSub reconnection failed - ${result.error || 'unknown error'}`);
                    }
                }
            } else {
                console.log(`⚠️ Unexpected response from EventSub service: ${response.status}`);
            }
            
        } catch (error) {
            console.log(`❌ Failed to trigger EventSub reconnections: ${error.message}`);
            // This is not a critical failure for token renewal, so continue
        }
    }
}

// Initialize renewal service
const renewalService = new TokenRenewalService();

// ===== 60-DAY BOT TOKEN MANAGEMENT SYSTEM =====
const { exec } = require('child_process');
const TelegramNotifier = require('./telegram-notifier');

class BotTokenManager {
    constructor() {
        this.envPath = path.join(__dirname, '.env');
        this.checkInterval = null;
        this.telegram = new TelegramNotifier();
        this.lastNotificationDays = null; // Track last notification to avoid spam
    }

    async start() {
        console.log('🤖 Starting 60-Day Bot Token Manager...');
        
        // Check token status on startup
        await this.checkBotToken();
        
        // Check every 12 hours
        this.checkInterval = setInterval(() => {
            this.checkBotToken();
        }, 12 * 60 * 60 * 1000);
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            console.log('🤖 Bot Token Manager stopped');
        }
    }

    async checkBotToken() {
        try {
            const token = process.env.TWITCH_OAUTH?.replace('oauth:', '');
            if (!token) {
                console.log('⚠️ No bot token found in .env file');
                return;
            }

            const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `OAuth ${token}` },
                timeout: 5000
            });

            const data = response.data;
            const daysLeft = Math.floor(data.expires_in / 86400);
            const hoursLeft = Math.floor((data.expires_in % 86400) / 3600);

            console.log(`🤖 Bot token expires in ${daysLeft} days (${data.expires_in} seconds)`);

            // Send Telegram notification based on days remaining
            // Only send once per threshold to avoid spam
            if (daysLeft <= 7) {
                console.log('🚨 BOT TOKEN RENEWAL REQUIRED - Less than 7 days remaining!');
                console.log(`🔗 Visit: ${BASE_URL}/auth/bot-token to renew`);

                // Send notification if we haven't notified at this level yet
                if (this.lastNotificationDays === null || this.lastNotificationDays > daysLeft) {
                    await this.telegram.notifyBotTokenExpiry(daysLeft, hoursLeft);
                    this.lastNotificationDays = daysLeft;
                }
            }

        } catch (error) {
            console.log('❌ Bot token validation failed:', error.response?.data || error.message);
            console.log(`🔗 Visit: ${BASE_URL}/auth/bot-token to generate new token`);

            // Send critical notification for expired token (only once)
            if (this.lastNotificationDays !== 0) {
                await this.telegram.notifyBotTokenExpiry(0, 0);
                this.lastNotificationDays = 0;
            }
        }
    }

    async updateBotToken(newToken) {
        try {
            // Read current .env file
            const envContent = await fs.readFile(this.envPath, 'utf8');
            
            // Update TWITCH_OAUTH line
            const updatedContent = envContent.replace(
                /^TWITCH_OAUTH=.*$/m,
                `TWITCH_OAUTH=oauth:${newToken}`
            );

            // Write back to .env
            await fs.writeFile(this.envPath, updatedContent);
            
            console.log('✅ Bot token updated in .env file');
            
            // Restart all bots
            await this.restartAllBots();

            // Re-read .env file to update process.env and check new token
            // Force reload by deleting the cached value first
            delete require.cache[require.resolve('dotenv')];
            require('dotenv').config({ override: true });

            // Wait longer for bots to restart before checking
            setTimeout(() => {
                this.checkBotToken();
            }, 3000);
            
            return true;
        } catch (error) {
            console.log('❌ Failed to update bot token:', error.message);
            return false;
        }
    }

    async restartAllBots() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Restarting all bot instances...');
            
            // Get list of all processes except OAuth Token Manager and CountD Overlay
            exec('pm2 jlist', (listError, listStdout, listStderr) => {
                if (listError) {
                    console.log('❌ Failed to get process list:', listError.message);
                    reject(listError);
                    return;
                }
                
                try {
                    const processes = JSON.parse(listStdout);
                    const botProcesses = processes
                        .filter(p => p.name !== 'OAuth Token Manager' && p.name !== 'CountD Overlay' && p.name !== 'EventSub Manager')
                        .map(p => `"${p.name}"`)
                        .join(' ');
                    
                    if (!botProcesses) {
                        console.log('✅ No bot processes to restart');
                        resolve('No bot processes found');
                        return;
                    }
                    
                    exec(`pm2 restart ${botProcesses} --update-env`, (error, stdout, stderr) => {
                        if (error) {
                            console.log('❌ Failed to restart bots:', error.message);
                            reject(error);
                        } else {
                            console.log('✅ All bots restarted successfully');
                            console.log(stdout);
                            resolve();
                        }
                    });
                } catch (parseError) {
                    console.log('❌ Failed to parse process list:', parseError.message);
                    reject(parseError);
                }
            });
        });
    }
}

// Bot token management endpoints (separate from broadcaster OAuth)
app.get('/auth/bot-token', requireAuth, (req, res) => {
    const clientId = TWITCH_CLIENT_ID;
    const redirectUri = `${BASE_URL}/auth/bot-token-callback`;
    const scopes = 'chat:read+chat:edit+channel:read:subscriptions+moderator:manage:banned_users';

    // Check if logged in user is the bot owner
    const loggedInUser = req.session.user.login;
    const expectedBotAccount = process.env.TWITCH_USERNAME;
    const isCorrectAccount = loggedInUser.toLowerCase() === expectedBotAccount.toLowerCase();

    const accountWarning = !isCorrectAccount ? `
        <div class="warning" style="background: #dc2626; border: 2px solid #f87171;">
            <strong>🚨 WRONG ACCOUNT!</strong><br>
            You are logged in as: <strong>${loggedInUser}</strong><br>
            Expected bot account: <strong>${expectedBotAccount}</strong><br><br>
            <strong>You MUST logout and login as the bot account to generate the bot token!</strong><br>
            <a href="/auth/logout" style="color: white; text-decoration: underline;">Click here to logout</a>
        </div>
    ` : `
        <div class="success">
            ✅ Logged in as: <strong>${loggedInUser}</strong> (Correct bot account)
        </div>
    `;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bot Token Management</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #1a1a1a; color: #fff; }
                .button { background: #9146ff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
                .button:hover { background: #7c3aed; }
                .button.disabled { background: #666; cursor: not-allowed; pointer-events: none; }
                .status { background: #333; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .warning { background: #ff6b35; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .success { background: #4caf50; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .info { background: #2196f3; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .logout-link { color: #9ca3af; font-size: 14px; float: right; }
            </style>
        </head>
        <body>
            <a href="/auth/logout" class="logout-link">Logout</a>
            <h1>🤖 Bot Token Management (60-Day Implicit Flow)</h1>

            <div class="info">
                <strong>ℹ️ Bot Owner Only:</strong> This manages the main bot token used by all bot instances.
                <br><strong>Note:</strong> This is separate from broadcaster tokens used for channel point redemptions.
            </div>

            ${accountWarning}

            <p>Current bot token status:</p>
            <div id="status" class="status">Loading...</div>

            <a href="https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scopes}"
               class="button ${!isCorrectAccount ? 'disabled' : ''}">
                Generate New 60-Day Bot Token
            </a>

            <h3>What happens when you generate a new token:</h3>
            <ol>
                <li>You'll be redirected to Twitch to authorize the bot account</li>
                <li>New 60-day token will be generated using implicit flow</li>
                <li>Token will be automatically saved to .env file</li>
                <li>All bot instances will be restarted with new token</li>
                <li>Bot will have chat permissions for all channels</li>
            </ol>

            <div class="warning">
                <strong>⚠️ Important:</strong> Make sure you're logged into the <strong>bot account</strong> (${process.env.TWITCH_USERNAME}) on Twitch before clicking the button above.
            </div>
            
            <script>
                // Function to refresh token status
                function refreshTokenStatus() {
                    fetch('/auth/bot-token-status')
                        .then(r => r.json())
                        .then(data => {
                            const statusDiv = document.getElementById('status');
                            if (data.valid) {
                                const days = Math.floor(data.expires_in / 86400);
                                const statusClass = days <= 7 ? 'warning' : 'success';
                                statusDiv.className = 'status ' + statusClass;
                                statusDiv.innerHTML = \`✅ Current token expires in <strong>\${days} days</strong> (Login: \${data.login})<br>Scopes: \${data.scopes.join(', ')}\`;
                            } else {
                                statusDiv.className = 'status warning';
                                statusDiv.innerHTML = '❌ Current token is invalid or expired';
                            }
                        })
                        .catch(() => {
                            document.getElementById('status').innerHTML = '❌ Unable to check token status';
                        });
                }
                
                // Check current token status on page load
                refreshTokenStatus();
            </script>
        </body>
        </html>
    `);
});

app.get('/auth/bot-token-callback', async (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Bot Token Processing</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #1a1a1a; color: #fff; }
                .success { background: #4caf50; color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .error { background: #f44336; color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .processing { background: #ff9800; color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .token-display { background: #333; padding: 15px; border-radius: 5px; margin: 10px 0; word-break: break-all; font-family: monospace; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>🤖 Bot Token Processing</h1>
            <div id="result" class="processing">Processing new token...</div>
            
            <script>
                // Extract token from URL fragment
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const token = params.get('access_token');
                
                if (token) {
                    // Save token
                    fetch('/auth/bot-token-save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: token })
                    })
                    .then(r => r.json())
                    .then(data => {
                        const resultDiv = document.getElementById('result');
                        if (data.success) {
                            resultDiv.className = 'success';
                            resultDiv.innerHTML = \`
                                <h3>✅ Bot Token Updated Successfully!</h3>
                                <p>Login: <strong>\${data.login}</strong></p>
                                <p>Token expires in: <strong>\${Math.floor(data.expires_in / 86400)} days</strong></p>
                                <p>Scopes: \${data.scopes.join(', ')}</p>
                                <p>All bot instances are being restarted with the new token...</p>
                                <div class="token-display">Token: \${token}</div>
                                <p><a href="/auth/bot-token" style="color: #fff;">← Back to Bot Token Management</a></p>
                            \`;
                            
                            // Refresh the status display on the main page
                            setTimeout(() => {
                                refreshTokenStatus();
                            }, 2000);
                        } else {
                            resultDiv.className = 'error';
                            resultDiv.innerHTML = \`
                                <h3>❌ Failed to Update Token</h3>
                                <p>Error: \${data.error}</p>
                                <p><a href="/auth/bot-token" style="color: #fff;">← Try Again</a></p>
                            \`;
                        }
                    })
                    .catch(error => {
                        document.getElementById('result').className = 'error';
                        document.getElementById('result').innerHTML = \`
                            <h3>❌ Error Processing Token</h3>
                            <p>\${error.message}</p>
                            <p><a href="/auth/bot-token" style="color: #fff;">← Try Again</a></p>
                        \`;
                    });
                } else {
                    document.getElementById('result').className = 'error';
                    document.getElementById('result').innerHTML = \`
                        <h3>❌ No Token Received</h3>
                        <p>Authorization may have failed or been cancelled.</p>
                        <p><a href="/auth/bot-token" style="color: #fff;">← Try Again</a></p>
                    \`;
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/auth/bot-token-status', async (req, res) => {
    try {
        const token = process.env.TWITCH_OAUTH?.replace('oauth:', '');
        if (!token) {
            return res.json({ valid: false, error: 'No token found' });
        }

        const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `OAuth ${token}` },
            timeout: 5000
        });

        res.json({ 
            valid: true, 
            expires_in: response.data.expires_in,
            login: response.data.login,
            scopes: response.data.scopes
        });
    } catch (error) {
        res.json({ valid: false, error: error.response?.data || error.message });
    }
});

app.post('/auth/bot-token-save', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.json({ success: false, error: 'No token provided' });
        }

        // Validate token first
        const validateResponse = await axios.get('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `OAuth ${token}` },
            timeout: 5000
        });

        const tokenData = validateResponse.data;
        
        // Check if token has required scopes
        const requiredScopes = ['chat:read', 'chat:edit', 'channel:read:subscriptions', 'moderator:manage:banned_users'];
        const hasAllScopes = requiredScopes.every(scope => tokenData.scopes.includes(scope));
        
        if (!hasAllScopes) {
            return res.json({ 
                success: false, 
                error: `Token missing required scopes. Has: ${tokenData.scopes.join(', ')}. Required: ${requiredScopes.join(', ')}` 
            });
        }

        // Verify this is the correct bot account
        if (tokenData.login.toLowerCase() !== process.env.TWITCH_USERNAME.toLowerCase()) {
            return res.json({
                success: false,
                error: `Token is for wrong account. Expected: ${process.env.TWITCH_USERNAME}, Got: ${tokenData.login}`
            });
        }

        // Update token in .env and restart bots
        const success = await botTokenManager.updateBotToken(token);
        
        if (success) {
            res.json({ 
                success: true, 
                expires_in: tokenData.expires_in,
                login: tokenData.login,
                scopes: tokenData.scopes
            });
        } else {
            res.json({ success: false, error: 'Failed to update token in .env file' });
        }
        
    } catch (error) {
        console.log('Error saving bot token:', error.message);
        res.status(500).json({ success: false, error: error.response?.data?.message || error.message });
    }
});

// App Access Token route for Chat Bot Badge
app.get('/auth/generate-app-token', requireAuth, async (req, res) => {
    try {
        const appToken = await ensureAppAccessToken();
        res.json({
            success: true,
            message: 'App Access Token generated successfully',
            token: {
                expires_in: appToken.expires_in,
                created_at: appToken.created_at,
                is_app_token: appToken.is_app_token
            }
        });
    } catch (error) {
        console.error('Error generating App Access Token:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate App Access Token',
            error: error.message
        });
    }
});

// Test Telegram notification endpoint (disabled for security)
// Uncomment to test Telegram notifications manually
/*
app.get('/auth/test-telegram', async (req, res) => {
    try {
        const testNotifier = new TelegramNotifier();
        const result = await testNotifier.sendTestNotification();

        res.json({
            success: result.success,
            message: result.message,
            telegram_enabled: testNotifier.enabled,
            chat_id: testNotifier.chatId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending test notification',
            error: error.message
        });
    }
});
*/

// Initialize bot token manager
const botTokenManager = new BotTokenManager();

// Start the server
app.listen(port, () => {
    console.log(`🔒 Secure Mr-AI-is-Here OAuth Manager listening at http://localhost:${port}`);
    console.log(`🌐 Public URL: ${BASE_URL}/auth`);
    console.log(`🛡️ Security: Session-based authentication with channel ownership verification`);

    // Start auto-renewal service
    renewalService.start();
    
    // Start bot token manager
    botTokenManager.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down Secure Mr-AI-is-Here OAuth Manager...');
    renewalService.stop();
    botTokenManager.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down Secure Mr-AI-is-Here OAuth Manager...');
    renewalService.stop();
    botTokenManager.stop();
    process.exit(0);
});