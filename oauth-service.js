require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const port = 3001;

// Configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENTID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENTSECRET;
const REDIRECT_URI = 'https://mr-ai.dev/auth/callback';
const LOGIN_REDIRECT_URI = 'https://mr-ai.dev/auth/login-callback';
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
function generateChannelAuthUrl(channelName, scopes = 'channel:read:redemptions chat:read') {
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
                body { font-family: Arial, sans-serif; margin: 20px; background-color: #f8f9fa; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                h1 { color: #9146ff; text-align: center; margin-bottom: 20px; font-size: 24px; }
                .login-section { text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px; margin: 15px 0; }
                .auth-btn { background-color: #9146ff; color: white; border: none; padding: 15px 25px; font-size: 16px; cursor: pointer; border-radius: 6px; text-decoration: none; display: inline-block; width: 100%; max-width: 300px; box-sizing: border-box; }
                .auth-btn:hover { background-color: #7c3aed; }
                .info { background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .security-note { background-color: #d4edda; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #28a745; }
                
                /* Mobile responsive */
                @media (max-width: 768px) {
                    body { margin: 10px; }
                    .container { padding: 15px; }
                    h1 { font-size: 20px; margin-bottom: 15px; }
                    .login-section { padding: 15px; }
                    .auth-btn { padding: 12px 20px; font-size: 16px; }
                    .info, .security-note { padding: 12px; font-size: 14px; }
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

        let channelStatus = '';
        let actions = '';

        // Welcome message for new channels
        let welcomeMessage = '';
        if (isNewChannel) {
            welcomeMessage = `
                <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h3>🎉 Welcome to Mr-AI-is-Here Bot!</h3>
                    <p>We've automatically created a configuration for your channel <strong>${username}</strong>.</p>
                    <p>Click "Generate OAuth Token" below to give Mr-AI-is-Here bot permission to operate in your channel.</p>
                </div>
            `;
        }

        // Check OAuth status
        let oauthStatus = '❌ No OAuth Token';
        let oauthDetails = '';

        if (config.oauth && config.oauth.access_token) {
            try {
                const validateResponse = await axios.get('https://id.twitch.tv/oauth2/validate', {
                    headers: { 'Authorization': `Bearer ${config.oauth.access_token}` }
                });

                oauthStatus = '✅ OAuth Active';
                oauthDetails = `
                    <p><strong>Token expires in:</strong> ${Math.floor(validateResponse.data.expires_in / 3600)} hours</p>
                    <p><strong>Scopes:</strong> ${validateResponse.data.scopes.join(', ')}</p>
                    <p><strong>Last updated:</strong> ${new Date(config.oauth.updated_at).toLocaleString()}</p>
                `;

                actions = `
    <button onclick="window.location.href = '/auth/status'" style="background-color: #007bff; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">📊 View Details</button>
    <button onclick="if(confirm('Refresh your OAuth token?')) window.location.href = '/auth/refresh'" style="background-color: #28a745; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🔄 Refresh Token</button>
    <button onclick="window.location.href = '/auth/generate'" style="background-color: #9146ff; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🔐 Re-authenticate</button>
    <button onclick="if(confirm('Are you sure you want to revoke your OAuth token? This will disable the bot in your channel.')) window.location.href = '/auth/revoke'" style="background-color: #dc3545; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🗑️ Revoke Access</button>
`;

            } catch (error) {
                if (error.response?.status === 401) {
                    oauthStatus = '⚠️ OAuth Token Expired';
                    oauthDetails = `
                        <p><strong>Last updated:</strong> ${new Date(config.oauth.updated_at).toLocaleString()}</p>
                        <p style="color: #856404;">Your OAuth token has expired and needs to be refreshed or regenerated.</p>
                    `;

                    actions = `
    <button onclick="if(confirm('Try to refresh your expired token?')) window.location.href = '/auth/refresh'" style="background-color: #ffc107; color: black; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🔄 Try Refresh</button>
    <button onclick="window.location.href = '/auth/generate'" style="background-color: #9146ff; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🔐 Re-authenticate</button>
    <button onclick="if(confirm('Remove the expired OAuth token?')) window.location.href = '/auth/revoke'" style="background-color: #dc3545; color: white; border: none; padding: 12px 20px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 16px;">🗑️ Remove Token</button>
`;
                }
            }
        } else {
            actions = `
    <button onclick="window.location.href = '/auth/generate'" style="background-color: #9146ff; color: white; border: none; padding: 15px 25px; margin: 8px; cursor: pointer; border-radius: 6px; font-size: 18px;">🔐 Generate OAuth Token</button>
`;
        }

        channelStatus = `
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>📋 Your Channel Status</h3>
                <p><strong>Channel:</strong> ${config.channelName || username}</p>
                <p><strong>Moderation Enabled:</strong> ${config.moderationEnabled ? 'Yes' : 'No'}</p>
                <p><strong>Chat Only Mode:</strong> ${config.chatOnly ? 'Yes' : 'No'}</p>
                <p><strong>Redemptions Enabled:</strong> ${config.redemptionEnabled ? 'Yes' : 'No'}</p>
                <p><strong>OAuth Status:</strong> ${oauthStatus}</p>
                ${oauthDetails}
            </div>
        `;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Mr-AI-is-Here OAuth Manager - ${username}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background-color: #f8f9fa; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #9146ff; margin-bottom: 15px; font-size: 24px; }
                    .user-info { background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                    .security-badge { background-color: #d4edda; padding: 10px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #28a745; }
                    .actions { text-align: center; margin: 20px 0; }
                    .actions button { margin: 8px 4px; }
                    .info { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
                    .logout { text-align: center; margin-top: 30px; }
                    .logout a { color: #6c757d; text-decoration: none; margin: 0 10px; }
                    .logout a:hover { text-decoration: underline; }
                    
                    /* Mobile responsive */
                    @media (max-width: 768px) {
                        body { margin: 10px; }
                        .container { padding: 15px; }
                        h1 { font-size: 20px; margin-bottom: 10px; }
                        .user-info, .security-badge, .info { padding: 12px; font-size: 14px; }
                        .actions { margin: 15px 0; }
                        .actions button { 
                            display: block; 
                            width: 100%; 
                            margin: 8px 0; 
                            padding: 12px; 
                            font-size: 14px; 
                            box-sizing: border-box;
                        }
                        ul { padding-left: 20px; }
                        .logout { margin-top: 20px; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 Mr-AI-is-Here OAuth Manager</h1>
                    
                    <div class="security-badge">
                        <strong>🔒 Secure Session:</strong> You are securely authenticated and can only manage your own channel.
                    </div>
                    
                    <div class="user-info">
                        <p><strong>👤 Signed in as:</strong> ${userSession.display_name} (@${userSession.login})</p>
                        <p><strong>📧 Email:</strong> ${userSession.email || 'Not provided'}</p>
                        <p><strong>🕐 Session started:</strong> ${new Date(userSession.authenticated_at).toLocaleString()}</p>
                    </div>
                    
                    ${welcomeMessage}
                    ${channelStatus}
                    
                    <div class="actions">
                        <h3>🔧 Manage Your Mr-AI-is-Here Bot</h3>
                        ${actions}
                    </div>
                    
                    <div class="info">
                        <h3>ℹ️ About OAuth Tokens</h3>
                        <ul>
                            <li><strong>Generate:</strong> Create new OAuth tokens for Mr-AI-is-Here bot to access your channel</li>
                            <li><strong>Refresh:</strong> Extend the life of existing tokens</li>
                            <li><strong>Re-authenticate:</strong> Create completely new tokens with fresh permissions</li>
                            <li><strong>Revoke:</strong> Remove Mr-AI-is-Here bot access from your channel completely</li>
                        </ul>
                        
                        <h4>🔧 Default Configuration</h4>
                        <ul>
                            <li><strong>Moderation:</strong> ${config.moderationEnabled ? 'Enabled' : 'Disabled'} - Bot can moderate your chat</li>
                            <li><strong>Chat Only:</strong> ${config.chatOnly ? 'Enabled' : 'Disabled'} - Bot only reads/writes chat</li>
                            <li><strong>Redemptions:</strong> ${config.redemptionEnabled ? 'Enabled' : 'Disabled'} - Bot responds to channel point redemptions</li>
                        </ul>
                    </div>
                    
                    <div class="logout">
                        <a href="/auth/claude">🤖 Claude</a> | 
                        <a href="/auth/logout">🚪 Sign out</a>
                    </div>
                </div>
            </body>
            </html>
        `);

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
    const scopes = req.query.scopes || 'chat:read channel:read:redemptions';
    const authUrl = generateChannelAuthUrl(username, scopes);

    console.log(`Starting OAuth flow for authenticated user: ${username}`);
    res.redirect(authUrl);
});

// OAuth callback for channel authorization (SECURE)
app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        console.error('OAuth authorization failed:', error);
        return res.status(400).send(`
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <a href="/auth">Back to Dashboard</a>
        `);
    }

    if (!state || !state.startsWith('channel_auth:')) {
        return res.status(400).send(`
            <h1>❌ Invalid Request</h1>
            <p>Missing or invalid channel information.</p>
            <a href="/auth">Back to Dashboard</a>
        `);
    }

    const stateParts = state.split(':');
    const channelName = stateParts[1]; // Extract just the channel name

    try {
        // Load existing channel config
        const config = await loadChannelConfig(channelName);
        if (!config) {
            return res.status(404).send(`
                <h1>❌ Channel Not Found</h1>
                <p>No configuration found for channel: <strong>${channelName}</strong></p>
                <a href="/auth">Back to Dashboard</a>
            `);
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
            return res.status(403).send(`
                <h1>🚫 Access Denied</h1>
                <p>OAuth flow was for channel <strong>${channelName}</strong> but you authenticated as <strong>@${userInfo.login}</strong>.</p>
                <p>You can only generate OAuth tokens for your own channel.</p>
                <br>
                <a href="/auth">Back to Your Dashboard</a>
            `);
        }

        // Add OAuth data to existing config
        config.oauth = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            scope: tokenData.scope,
            token_type: tokenData.token_type,
            username: userInfo.login,
            user_id: userInfo.id,
            display_name: userInfo.display_name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Save updated config
        await saveChannelConfig(channelName, config);

        res.send(`
            <h1>✅ OAuth Success!</h1>
            <p>OAuth tokens have been successfully generated for your channel!</p>
            <br>
            <p><strong>Channel:</strong> ${channelName}</p>
            <p><strong>Authenticated as:</strong> ${userInfo.display_name} (@${userInfo.login})</p>
            <p><strong>Token expires in:</strong> ${Math.floor(tokenData.expires_in / 3600)} hours</p>
            <p><strong>Scopes:</strong> ${Array.isArray(tokenData.scope) ? tokenData.scope.join(', ') : tokenData.scope}</p>
            <br>
            <p>🎉 Mr-AI-is-Here bot now has permission to operate in your channel!</p>
            <br>
            <a href="/auth">Back to Your Dashboard</a>
            <br><br>
        `);

    } catch (err) {
        console.error('Token exchange failed:', err.response?.data || err.message);
        res.status(500).send(`
            <h1>❌ Token Generation Failed</h1>
            <p>Error: ${err.message}</p>
            <a href="/auth">Back to Dashboard</a>
        `);
    }
});

// OAuth status page (SECURE - user can only view their own channel)
app.get('/auth/status', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    try {
        const config = await loadChannelConfig(username);

        if (!config) {
            return res.send(`
                <h1>❌ Channel Status: ${username}</h1>
                <p>Channel configuration not found.</p>
                <a href="/auth">Back to Dashboard</a>
            `);
        }

        if (!config.oauth || !config.oauth.access_token) {
            return res.send(`
                <h1>📋 Channel Status: ${username}</h1>
                <p>✅ Channel config exists</p>
                <p>❌ No OAuth token found</p>
                <br>
                <a href="/auth/generate">Generate OAuth Token</a> | 
                <a href="/auth">Back to Dashboard</a>
            `);
        }

        // Validate token with Twitch
        try {
            const validateResponse = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `Bearer ${config.oauth.access_token}` }
            });

            res.send(`
                <h1>✅ Channel Status: ${username}</h1>
                
                <h3>Channel Configuration</h3>
                <p><strong>Channel Name:</strong> ${config.channelName || username}</p>
                <p><strong>Moderator:</strong> ${config.moderatorUsername || 'Unknown'}</p>
                <p><strong>Moderation Enabled:</strong> ${config.moderationEnabled ? 'Yes' : 'No'}</p>
                <p><strong>Chat Only:</strong> ${config.chatOnly ? 'Yes' : 'No'}</p>
                <p><strong>Redemptions Enabled:</strong> ${config.redemptionEnabled ? 'Yes' : 'No'}</p>
                <p><strong>Last Updated:</strong> ${config.lastUpdated ? new Date(config.lastUpdated).toLocaleString() : 'Unknown'}</p>
                
                <h3>OAuth Token Status</h3>
                <p>✅ <strong>OAuth token is valid</strong></p>
                <p><strong>Authenticated As:</strong> ${config.oauth.display_name} (@${config.oauth.username})</p>
                <p><strong>User ID:</strong> ${config.oauth.user_id}</p>
                <p><strong>Scopes:</strong> ${validateResponse.data.scopes.join(', ')}</p>
                <p><strong>Expires in:</strong> ${Math.floor(validateResponse.data.expires_in / 3600)} hours</p>
                <p><strong>Created:</strong> ${new Date(config.oauth.created_at).toLocaleString()}</p>
                <p><strong>Last Updated:</strong> ${new Date(config.oauth.updated_at).toLocaleString()}</p>
                
                <br>
                <a href="/auth">Back to Your Dashboard</a>
            `);

        } catch (error) {
            if (error.response?.status === 401) {
                res.send(`
                    <h1>⚠️ Channel Status: ${username}</h1>
                    <p>✅ Channel config exists</p>
                    <p>❌ OAuth token is invalid or expired</p>
                    <br>
                    <p><strong>Authenticated As:</strong> ${config.oauth.display_name} (@${config.oauth.username})</p>
                    <p><strong>Created:</strong> ${new Date(config.oauth.created_at).toLocaleString()}</p>
                    <p><strong>Last Updated:</strong> ${new Date(config.oauth.updated_at).toLocaleString()}</p>
                    
                    <br>
                    <a href="/auth">Back to Your Dashboard</a>
                `);
            } else {
                throw error;
            }
        }

    } catch (error) {
        res.status(500).send(`
            <h1>❌ Error Checking Status</h1>
            <p>Channel: ${username}</p>
            <p>Error: ${error.message}</p>
            <a href="/auth">Back to Dashboard</a>
        `);
    }
});

// Refresh OAuth token (SECURE - user can only refresh their own)
app.get('/auth/refresh', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    try {
        const config = await loadChannelConfig(username);

        if (!config || !config.oauth || !config.oauth.refresh_token) {
            return res.status(404).send(`
                <h1>❌ Refresh Failed</h1>
                <p>No refresh token found for your channel: ${username}</p>
                <a href="/auth/generate">Generate New OAuth</a> | 
                <a href="/auth">Back to Dashboard</a>
            `);
        }

        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            grant_type: 'refresh_token',
            refresh_token: config.oauth.refresh_token,
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Update config with new tokens
        config.oauth.access_token = response.data.access_token;
        config.oauth.refresh_token = response.data.refresh_token;
        config.oauth.updated_at = new Date().toISOString();

        await saveChannelConfig(username, config);

        console.log(`OAuth token refreshed successfully for channel: ${username}`);
        res.send(`
            <h1>✅ Token Refreshed Successfully!</h1>
            <p>Your OAuth access token has been refreshed for channel: <strong>${username}</strong></p>
            <p>⏰ Token expires in: ${Math.floor(response.data.expires_in / 3600)} hours</p>
            <br>
            <a href="/auth">Back to Your Dashboard</a>
        `);

    } catch (error) {
        console.error(`OAuth refresh failed for ${username}:`, error.response?.data || error.message);
        res.status(500).send(`
            <h1>❌ Refresh Failed</h1>
            <p>Channel: ${username}</p>
            <p>Error: ${error.response?.data?.message || error.message}</p>
            <br>
            <a href="/auth/generate">Generate New OAuth</a> | 
            <a href="/auth">Back to Dashboard</a>
        `);
    }
});

// Revoke OAuth token (SECURE - user can only revoke their own)
app.get('/auth/revoke', requireAuth, async (req, res) => {
    const username = req.session.user.login;

    try {
        const config = await loadChannelConfig(username);

        if (!config || !config.oauth || !config.oauth.access_token) {
            return res.status(404).send(`
                <h1>❌ Revoke Failed</h1>
                <p>No OAuth access token found for your channel: ${username}</p>
                <a href="/auth">Back to Dashboard</a>
            `);
        }

        // Revoke token with Twitch
        await axios.post('https://id.twitch.tv/oauth2/revoke', {
            client_id: TWITCH_CLIENT_ID,
            token: config.oauth.access_token
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Remove OAuth section from config
        delete config.oauth;
        await saveChannelConfig(username, config);

        console.log(`OAuth token revoked successfully for channel: ${username}`);
        res.send(`
            <h1>✅ Token Revoked Successfully!</h1>
            <p>Your OAuth access token has been revoked for channel: <strong>${username}</strong></p>
            <p>ℹ️ Mr-AI-is-Here bot no longer has access to your channel.</p>
            <p>Your channel configuration has been preserved.</p>
            <br>
            <a href="/auth">Back to Your Dashboard</a>
        `);

    } catch (error) {
        console.error(`OAuth revocation failed for ${username}:`, error.response?.data || error.message);
        res.status(500).send(`
            <h1>❌ Revoke Failed</h1>
            <p>Channel: ${username}</p>
            <p>Error: ${error.response?.data?.message || error.message}</p>
            <a href="/auth">Back to Dashboard</a>
        `);
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

        if (!config.oauth || !config.oauth.access_token) {
            return res.status(404).json({ error: `No OAuth token found for channel: ${channel}` });
        }

        // Validate token
        try {
            await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `Bearer ${config.oauth.access_token}` }
            });

            res.json({
                access_token: config.oauth.access_token,
                username: config.oauth.username,
                channel: channel
            });

        } catch (validationError) {
            if (validationError.response?.status === 401) {
                // Try to refresh token automatically
                if (config.oauth.refresh_token) {
                    try {
                        const refreshResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
                            grant_type: 'refresh_token',
                            refresh_token: config.oauth.refresh_token,
                            client_id: TWITCH_CLIENT_ID,
                            client_secret: TWITCH_CLIENT_SECRET
                        }, {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        });

                        // Update config with new tokens
                        config.oauth.access_token = refreshResponse.data.access_token;
                        config.oauth.refresh_token = refreshResponse.data.refresh_token;
                        config.oauth.updated_at = new Date().toISOString();
                        await saveChannelConfig(channel, config);

                        console.log(`Auto-refreshed OAuth token for channel: ${channel}`);

                        res.json({
                            access_token: refreshResponse.data.access_token,
                            username: config.oauth.username,
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
    const username = req.session.user.login;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Claude - ${username}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    background-color: #f8f9fa; 
                    padding-bottom: 50px; 
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white; 
                    padding: 20px; 
                    border-radius: 12px; 
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
                }
                h1 { 
                    color: #9146ff; 
                    text-align: center; 
                    margin-bottom: 20px; 
                    font-size: 24px; 
                }
                .user-info { 
                    background-color: #e3f2fd; 
                    padding: 15px; 
                    border-radius: 8px; 
                    margin-bottom: 20px; 
                    text-align: center; 
                }
                .input-section { 
                    margin: 20px 0; 
                }
                .input-section label { 
                    display: block; 
                    margin-bottom: 10px; 
                    font-weight: bold; 
                }
                .input-section input, .input-section textarea { 
                    width: 100%; 
                    padding: 12px; 
                    border: 2px solid #ddd; 
                    border-radius: 6px; 
                    font-size: 16px; 
                    box-sizing: border-box; 
                }
                .input-section textarea { 
                    height: 100px; 
                    resize: vertical; 
                }
                .trigger-btn { 
                    background-color: #9146ff; 
                    color: white; 
                    border: none; 
                    padding: 15px 30px; 
                    font-size: 18px; 
                    cursor: pointer; 
                    border-radius: 6px; 
                    width: 100%; 
                    margin: 10px 0; 
                    box-sizing: border-box; 
                }
                .trigger-btn:hover { 
                    background-color: #7c3aed; 
                }
                .trigger-btn:disabled { 
                    background-color: #ccc; 
                    cursor: not-allowed; 
                }
                .response-section { 
                    background-color: #f8f9fa; 
                    padding: 15px; 
                    border-radius: 8px; 
                    margin: 20px 0; 
                    display: none; 
                }
                .response-text { 
                    font-size: 16px; 
                    line-height: 1.5; 
                    margin-bottom: 15px; 
                }
                .audio-controls { 
                    display: flex; 
                    gap: 10px; 
                    flex-wrap: wrap; 
                }
                .audio-btn { 
                    background-color: #007bff; 
                    color: white; 
                    border: none; 
                    padding: 8px 16px; 
                    font-size: 14px; 
                    cursor: pointer; 
                    border-radius: 4px; 
                }
                .audio-btn:hover { 
                    background-color: #0056b3; 
                }
                .volume-control { 
                    display: flex; 
                    align-items: center; 
                    gap: 10px; 
                }
                .back-link { 
                    text-align: center; 
                    margin-top: 30px; 
                }
                .back-link a { 
                    color: #6c757d; 
                    text-decoration: none; 
                }
                .back-link a:hover { 
                    text-decoration: underline; 
                }
                .loading { 
                    text-align: center; 
                    color: #666; 
                    font-style: italic; 
                }
                
                /* Mobile responsive */
                @media (max-width: 768px) {
                    body { margin: 10px; }
                    .container { padding: 15px; }
                    h1 { font-size: 20px; }
                    .audio-controls { justify-content: center; }
                    .volume-control { flex-direction: column; align-items: center; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Claude</h1>
                
                <div class="user-info">
                    <p><strong>Streaming as:</strong> ${username}</p>
                    <p>Ask Claude and hear the response!</p>
                </div>
                
                <div class="input-section">
                    <label for="claudePrompt">Your Question for Claude:</label>
                    <textarea id="claudePrompt" placeholder="Type your question or use voice input..." maxlength="2000"></textarea>
                    <div id="voiceStatus" class="voice-status"></div>
                </div>
                
                
                <button id="triggerBtn" class="trigger-btn" onclick="triggerClaude()">🚀 Ask Claude</button>
                
                <div id="voiceSection" style="text-align: center; margin: 20px 0; display: none;">
                    <div style="margin-bottom: 15px;">
                        <label for="voiceSelect" style="display: block; font-weight: bold; margin-bottom: 5px;">AI Voice:</label>
                        <select id="voiceSelect" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd; font-size: 14px;">
                            <option value="">Loading AI voices...</option>
                        </select>
                    </div>
                    
                    <button id="oneTimeTrigger" class="trigger-btn" onclick="startOneTimeVoiceFlow()" style="background-color: #dc3545;">
                        🎤 One-Tap Voice Ask
                    </button>
                    <p style="font-size: 12px; color: #666; margin-top: 5px;">Tap once → Speak → Automatic Claude response with voice</p>
                </div>
                
                <div id="responseSection" class="response-section">
                    <div id="responseText" class="response-text"></div>
                    <div class="audio-controls">
                        <button class="audio-btn" onclick="speakResponse()">▶️ Play</button>
                        <button class="audio-btn" onclick="stopSpeaking()">⏹️ Stop</button>
                    </div>
                </div>
                
                <div class="back-link">
                    <a href="/auth">← Back to Dashboard</a>
                </div>
            </div>
            
            <script>
                let currentUtterance = null;
                let isPaused = false;
                let recognition = null;
                let isListening = false;
                let isGeneratingTTS = false; // Track TTS generation state
                
                function setPreset(text) {
                    document.getElementById('claudePrompt').value = text;
                }
                
                
                async function triggerClaude() {
                    const prompt = document.getElementById('claudePrompt').value.trim();
                    const triggerBtn = document.getElementById('triggerBtn');
                    const responseSection = document.getElementById('responseSection');
                    const responseText = document.getElementById('responseText');
                    
                    if (!prompt) {
                        alert('Please enter a question for Claude');
                        return;
                    }
                    
                    
                    // Update UI
                    triggerBtn.disabled = true;
                    triggerBtn.textContent = '🔄 Asking Claude...';
                    responseSection.style.display = 'none';
                    
                    try {
                        const response = await fetch('/auth/api/claude', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ prompt: prompt })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            // Clear TTS cache for new response
                            cachedAudioUrl = null;
                            cachedAudioText = null;
                            cachedAudioVoice = null;
                            console.log('🎵 Cleared TTS cache for new Claude response');
                            
                            // ALWAYS show text immediately (matches Twitch chat timing)
                            console.log('🎵 Showing Claude response immediately on UI');
                            responseText.textContent = data.response;
                            responseSection.style.display = 'block';
                            
                            // For voice triggers, also start TTS in background
                            if (userTriggeredAutoSpeak) {
                                userTriggeredAutoSpeak = false; // Reset flag
                                console.log('🎵 Voice triggered - starting TTS in background...');
                                try {
                                    // Start TTS generation/playback without waiting
                                    speakResponse().catch(error => {
                                        console.error('Auto-speak failed:', error);
                                    });
                                    console.log('🎵 Auto-speak initiated');
                                } catch (error) {
                                    console.error('Auto-speak failed:', error);
                                }
                            }
                        } else {
                            alert('Error: ' + data.error);
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        alert('Failed to communicate with Claude. Please try again.');
                    } finally {
                        triggerBtn.disabled = false;
                        triggerBtn.textContent = '🎤 Ask Claude';
                    }
                }
                
                async function speakResponse() {
                    console.log('🎵 Play button clicked');
                    
                    // Prevent multiple simultaneous TTS requests
                    if (isGeneratingTTS) {
                        console.log('🎵 TTS already generating, ignoring click');
                        return;
                    }
                    
                    // Get text from displayed text (always available immediately)
                    const text = document.getElementById('responseText').textContent;
                    const volume = 0.8; // Default volume
                    const selectedVoiceId = document.getElementById('voiceSelect').value;
                    
                    if (!text) {
                        console.log('🎵 No text to speak');
                        return;
                    }
                    
                    // Stop any existing speech first
                    speechSynthesis.cancel();
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio = null;
                    }
                    
                    // Check if we can reuse cached audio
                    if (cachedAudioUrl && cachedAudioText === text && cachedAudioVoice === selectedVoiceId) {
                        console.log('🎵 Using cached audio URL:', cachedAudioUrl);
                        playAudioFromUrl(cachedAudioUrl, volume);
                        return;
                    }
                    
                    // Need to generate new TTS
                    console.log('🎵 Generating new TTS for text:', text.substring(0, 50) + '...');
                    isGeneratingTTS = true;
                    updatePlayStopButtons(true);
                    
                    try {
                        // Use AI voice if available, fallback to system voice
                        if (selectedVoiceId && selectedVoiceId !== 'system') {
                            console.log('🎵 Using AI voice:', selectedVoiceId);
                            await speakWithAI(text, selectedVoiceId, volume);
                        } else {
                            console.log('🎵 Using system voice');
                            speakWithSystemVoice(text, volume);
                            // Cache system voice (though no URL to cache)
                            cachedAudioText = text;
                            cachedAudioVoice = selectedVoiceId;
                            cachedAudioUrl = null; // System voice has no URL
                        }
                    } catch (error) {
                        console.error('🎵 TTS generation failed:', error);
                        updatePlayStopButtons(false);
                    } finally {
                        isGeneratingTTS = false;
                    }
                }
                
                let currentAudio = null;
                let userTriggeredAutoSpeak = false; // Track if user expects auto-speak
                let cachedAudioUrl = null; // Cache the TTS audio URL
                let cachedAudioText = null; // Cache the text that was used for TTS
                let cachedAudioVoice = null; // Cache the voice that was used
                
                function updatePlayStopButtons(isPlaying) {
                    const playBtn = document.querySelector('.audio-btn[onclick="speakResponse()"]');
                    const stopBtn = document.querySelector('.audio-btn[onclick="stopSpeaking()"]');
                    
                    if (isPlaying || isGeneratingTTS) {
                        if (playBtn) {
                            playBtn.disabled = true;
                            playBtn.textContent = isGeneratingTTS ? '⏳ Generating...' : '🔊 Playing...';
                            playBtn.style.opacity = '0.6';
                        }
                        if (stopBtn) {
                            stopBtn.disabled = false;
                            stopBtn.style.opacity = '1';
                        }
                    } else {
                        if (playBtn) {
                            playBtn.disabled = false;
                            playBtn.textContent = '▶️ Play';
                            playBtn.style.opacity = '1';
                        }
                        if (stopBtn) {
                            stopBtn.disabled = false;
                            stopBtn.style.opacity = '1';
                        }
                    }
                }
                
                function playAudioFromUrl(audioUrl, volume) {
                    console.log('🎵 Playing cached audio from URL');
                    
                    // Use prepped audio if available (for mobile), otherwise create new
                    if (window.preppedAudio) {
                        currentAudio = window.preppedAudio;
                        currentAudio.src = audioUrl;
                        window.preppedAudio = null; // Clear it
                    } else {
                        currentAudio = new Audio(audioUrl);
                    }
                    
                    currentAudio.volume = parseFloat(volume);
                    
                    currentAudio.onended = () => {
                        console.log('🎵 Cached audio playback ended');
                        currentAudio = null;
                        updatePlayStopButtons(false);
                    };
                    
                    currentAudio.onerror = (error) => {
                        console.error('🎵 Cached audio playback error:', error);
                        currentAudio = null;
                        updatePlayStopButtons(false);
                    };
                    
                    updatePlayStopButtons(true);
                    currentAudio.play().catch(error => {
                        console.error('🎵 Cached audio play failed:', error);
                        updatePlayStopButtons(false);
                    });
                }
                
                async function speakWithAI(text, voiceId, volume) {
                    // Generate speech using premium AI voices
                    const response = await fetch('/auth/api/tts', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            text: text,
                            voice_id: voiceId,
                            volume: volume
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('TTS API failed');
                    }
                    
                    const responseData = await response.json();
                    
                    if (responseData.success && responseData.audioUrl) {
                        // We got a direct URL from TTS Monster
                        console.log('Using TTS Monster direct URL:', responseData.audioUrl);
                        
                        // Cache the audio for future use
                        cachedAudioUrl = responseData.audioUrl;
                        cachedAudioText = text;
                        cachedAudioVoice = voiceId;
                        console.log('🎵 Cached TTS audio for future plays');
                        
                        // Use prepped audio if available (for mobile), otherwise create new
                        if (window.preppedAudio) {
                            currentAudio = window.preppedAudio;
                            currentAudio.src = responseData.audioUrl;
                            window.preppedAudio = null; // Clear it
                            console.log('Using prepped audio for mobile compatibility');
                        } else {
                            currentAudio = new Audio(responseData.audioUrl);
                        }
                        
                        currentAudio.volume = parseFloat(volume);
                        
                        return new Promise((resolve, reject) => {
                            currentAudio.onended = () => {
                                console.log('🎵 Audio playback ended');
                                currentAudio = null; // Clear audio reference
                                updatePlayStopButtons(false);
                                resolve();
                            };
                            
                            currentAudio.onerror = (error) => {
                                console.error('🎵 Audio playback error:', error);
                                currentAudio = null; // Clear audio reference
                                updatePlayStopButtons(false);
                                reject(error);
                            };
                            
                            currentAudio.oncanplay = () => {
                                console.log('🎵 Audio ready to play');
                                isGeneratingTTS = false; // Generation complete
                                updatePlayStopButtons(true);
                            };
                            
                            // Text is already shown immediately when Claude responds
                            
                            console.log('🎵 Starting audio playback');
                            currentAudio.play().catch(error => {
                                console.error('🎵 Audio play failed:', error);
                                updatePlayStopButtons(false);
                                isGeneratingTTS = false;
                                reject(error);
                            });
                        });
                    } else if (responseData.fallback === 'browser') {
                        // Use enhanced browser TTS with better settings
                        console.log('Using enhanced system voice fallback');
                        return speakWithEnhancedSystemVoice(text, responseData.voice_settings);
                    } else {
                        throw new Error('No audio service available');
                    }
                }
                
                function speakWithEnhancedSystemVoice(text, voiceSettings) {
                    return new Promise((resolve, reject) => {
                        currentUtterance = new SpeechSynthesisUtterance(text);
                        currentUtterance.volume = voiceSettings.volume || 0.8;
                        currentUtterance.rate = voiceSettings.rate || 0.85;
                        currentUtterance.pitch = voiceSettings.pitch || 1.0;
                        
                        // Find the best available system voice with quality prioritization
                        const voices = speechSynthesis.getVoices();
                        console.log('Available voices:', voices.map(v => v.name + ' (' + v.lang + ')'));
                        
                        // Priority list of high-quality voices
                        const qualityVoices = [
                            // Google voices (highest quality)
                            'Google US English',
                            'Google UK English Female',
                            'Google UK English Male',
                            'Google Australian English',
                            'Google Canadian English',
                            // Microsoft Neural voices
                            'Microsoft Aria Online (Natural) - English (United States)',
                            'Microsoft Jenny Online (Natural) - English (United States)',
                            'Microsoft Guy Online (Natural) - English (United States)',
                            'Microsoft Zira - English (United States)',
                            'Microsoft Mark - English (United States)',
                            // macOS voices
                            'Samantha',
                            'Alex',
                            'Victoria',
                            'Karen',
                            'Moira',
                            'Tessa',
                            'Veena',
                            // iOS voices
                            'Nicky',
                            'Siri Female',
                            'Siri Male'
                        ];
                        
                        // Find the best available voice
                        let selectedVoice = null;
                        for (const qualityVoiceName of qualityVoices) {
                            selectedVoice = voices.find(voice => 
                                voice.name.includes(qualityVoiceName) || 
                                voice.name === qualityVoiceName
                            );
                            if (selectedVoice) break;
                        }
                        
                        // If no quality voice found, try any English voice
                        if (!selectedVoice) {
                            selectedVoice = voices.find(voice => 
                                voice.lang.startsWith('en-') && 
                                !voice.name.includes('eSpeak')
                            );
                        }
                        
                        if (selectedVoice) {
                            currentUtterance.voice = selectedVoice;
                            console.log('Using enhanced system voice:', selectedVoice.name, '(' + selectedVoice.lang + ')');
                        }
                        
                        currentUtterance.onend = () => {
                            console.log('🎵 System voice playback ended');
                            isPaused = false;
                            currentUtterance = null; // Clear utterance reference
                            updatePlayStopButtons(false);
                            resolve();
                        };
                        
                        currentUtterance.onerror = (error) => {
                            console.error('🎵 System voice error:', error);
                            currentUtterance = null; // Clear utterance reference
                            updatePlayStopButtons(false);
                            reject(error);
                        };
                        
                        currentUtterance.onstart = () => {
                            console.log('🎵 System voice playback started');
                            isGeneratingTTS = false; // Generation complete, now playing
                            updatePlayStopButtons(true);
                        };
                        
                        speechSynthesis.speak(currentUtterance);
                        isPaused = false;
                    });
                }
                
                function speakWithSystemVoice(text, volume) {
                    const voiceSettings = {
                        volume: parseFloat(volume),
                        rate: 0.85,
                        pitch: 1.0
                    };
                    speakWithEnhancedSystemVoice(text, voiceSettings);
                }
                
                function stopSpeaking() {
                    console.log('🛑 Stopping all audio playback');
                    
                    // Cancel speech synthesis
                    speechSynthesis.cancel();
                    
                    // Stop current audio
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio.currentTime = 0; // Reset to beginning
                        currentAudio = null;
                    }
                    
                    // Reset state
                    isPaused = false;
                    isGeneratingTTS = false;
                    
                    // Update button states
                    updatePlayStopButtons(false);
                    
                    console.log('🛑 Audio stopped successfully');
                }
                
                function pauseSpeaking() {
                    if (currentAudio && !currentAudio.paused) {
                        currentAudio.pause();
                        isPaused = true;
                    } else if (speechSynthesis.speaking && !isPaused) {
                        speechSynthesis.pause();
                        isPaused = true;
                    }
                }
                
                function resumeSpeaking() {
                    if (currentAudio && currentAudio.paused) {
                        currentAudio.play();
                        isPaused = false;
                    } else if (isPaused) {
                        speechSynthesis.resume();
                        isPaused = false;
                    }
                }
                
                // Initialize speech recognition
                function initSpeechRecognition() {
                    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                        recognition = new SpeechRecognition();
                        
                        recognition.continuous = false;
                        recognition.interimResults = false; // Disable interim results to prevent text changing
                        recognition.lang = 'en-US';
                        recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy
                        
                        // Mobile-specific improvements
                        if (isMobileDevice()) {
                            recognition.grammars = null; // Disable grammar for better mobile performance
                            recognition.serviceURI = null; // Use default service for better mobile compatibility
                        }
                        
                        recognition.onstart = function() {
                            isListening = true;
                            console.log('🎤 SPEECH: Recognition started successfully');
                            console.log('🎤 SPEECH: isListening =', isListening);
                            
                            // Update visual indicators
                            const voiceStatus = document.getElementById('voiceStatus');
                            const oneTimeBtn = document.getElementById('oneTimeTrigger');
                            
                            voiceStatus.style.display = 'block';
                            voiceStatus.style.backgroundColor = '#d4edda';
                            voiceStatus.style.color = '#155724';
                            voiceStatus.style.border = '1px solid #c3e6cb';
                            voiceStatus.textContent = '🎤 LISTENING - Speak now!';
                            
                            oneTimeBtn.style.backgroundColor = '#dc3545';
                            oneTimeBtn.textContent = '🔴 Recording...';
                            
                            // Play a "start listening" sound to indicate when to speak
                            try {
                                const startBeep = new AudioContext();
                                const oscillator = startBeep.createOscillator();
                                const gainNode = startBeep.createGain();
                                
                                oscillator.connect(gainNode);
                                gainNode.connect(startBeep.destination);
                                
                                oscillator.frequency.setValueAtTime(800, startBeep.currentTime); // High pitch
                                gainNode.gain.setValueAtTime(0.1, startBeep.currentTime);
                                
                                oscillator.start();
                                oscillator.stop(startBeep.currentTime + 0.1); // 100ms beep
                            } catch (error) {
                                console.log('Could not play start beep:', error);
                            }
                        };
                        
                        recognition.onresult = function(event) {
                            console.log('🎤 SPEECH: onresult event fired, resultIndex:', event.resultIndex, 'results.length:', event.results.length);
                            
                            let transcript = '';
                            let isFinal = false;
                            
                            for (let i = event.resultIndex; i < event.results.length; i++) {
                                const result = event.results[i];
                                
                                // Check all alternatives and pick the one with highest confidence
                                let bestTranscript = result[0].transcript;
                                let bestConfidence = result[0].confidence;
                                
                                for (let j = 0; j < result.length && j < 3; j++) {
                                    const alternative = result[j];
                                    console.log('🎤 SPEECH: Alternative', j, '- Text:', '"' + alternative.transcript + '"', 'confidence:', alternative.confidence);
                                    
                                    if (alternative.confidence > bestConfidence) {
                                        bestTranscript = alternative.transcript;
                                        bestConfidence = alternative.confidence;
                                    }
                                }
                                
                                transcript += bestTranscript;
                                console.log('🎤 SPEECH: Best result for', i, '- Text:', '"' + bestTranscript + '"', 'confidence:', bestConfidence, 'isFinal:', result.isFinal);
                                
                                if (result.isFinal) {
                                    isFinal = true;
                                }
                            }
                            
                            console.log('🎤 SPEECH: Combined transcript:', '"' + transcript + '"', 'isFinal:', isFinal);
                            
                            // Update textarea with current transcript
                            document.getElementById('claudePrompt').value = transcript.trim();
                            
                            if (isFinal) {
                                console.log('🎤 SPEECH: Final result detected, stopping recognition and triggering Claude');
                                // Stop listening immediately to free up microphone
                                stopListening();
                                // Automatically trigger Claude after speech completes
                                setTimeout(() => {
                                    if (transcript.trim().length > 0) {
                                        console.log('🎤 SPEECH: Triggering Claude with final transcript:', '"' + transcript.trim() + '"');
                                        triggerClaude();
                                    } else {
                                        console.log('🎤 SPEECH: Empty transcript, not triggering Claude');
                                    }
                                }, 300);
                            }
                        };
                        
                        recognition.onerror = function(event) {
                            console.error('🎤 SPEECH ERROR: Type:', event.error, 'isListening:', isListening);
                            console.error('🎤 SPEECH ERROR: Full event:', event);
                            
                            // Handle specific mobile errors gracefully
                            if (event.error === 'not-allowed') {
                                console.error('🎤 SPEECH ERROR: Microphone access denied');
                                alert('Microphone access denied. Please enable microphone permissions.');
                                stopListening();
                            } else if (event.error === 'no-speech') {
                                console.log('🎤 SPEECH ERROR: No speech detected - ending session');
                                stopListening();
                            } else if (event.error === 'audio-capture') {
                                console.log('🎤 SPEECH ERROR: Audio capture error (likely microphone conflict) - safely ignored');
                                // Don't show alert for audio-capture errors as they're often false positives
                                stopListening();
                            } else if (event.error === 'aborted') {
                                console.log('🎤 SPEECH ERROR: Speech recognition aborted - normal operation');
                                // Don't show error for intentional aborts
                            } else {
                                console.log('🎤 SPEECH ERROR: Unknown error:', event.error, '- stopping gracefully');
                                stopListening();
                            }
                        };
                        
                        recognition.onend = function() {
                            console.log('🎤 SPEECH: onend event fired, isListening:', isListening);
                            stopListening();
                        };
                        
                        return true;
                    }
                    return false;
                }
                
                function stopListening() {
                    console.log('🎤 SPEECH: stopListening() called, current isListening:', isListening);
                    isListening = false;
                    
                    // Reset button and visual indicators
                    const oneTimeBtn = document.getElementById('oneTimeTrigger');
                    const voiceStatus = document.getElementById('voiceStatus');
                    
                    oneTimeBtn.disabled = false;
                    oneTimeBtn.textContent = '🎤 One-Tap Voice Ask';
                    oneTimeBtn.style.backgroundColor = '#dc3545'; // Reset to original color
                    
                    voiceStatus.style.display = 'none';
                    
                    if (recognition) {
                        try {
                            console.log('🎤 SPEECH: Calling recognition.stop() and abort()');
                            recognition.stop();
                            recognition.abort(); // Force stop to prevent conflicts
                            console.log('🎤 SPEECH: Recognition stopped successfully');
                        } catch (error) {
                            console.log('🎤 SPEECH: Recognition stop error (safely ignored):', error);
                        }
                    } else {
                        console.log('🎤 SPEECH: No recognition object to stop');
                    }
                }
                
                function startOneTimeVoiceFlow() {
                    // Clear any existing input
                    document.getElementById('claudePrompt').value = '';
                    
                    // Update button to show it's active
                    const oneTimeBtn = document.getElementById('oneTimeTrigger');
                    oneTimeBtn.disabled = true;
                    oneTimeBtn.textContent = '🎤 Listening...';
                    
                    // Mark that user wants auto-speak
                    userTriggeredAutoSpeak = true;
                    
                    // CRITICAL: Pre-create audio for later use on mobile (don't interfere with speech recognition beep)
                    try {
                        // Pre-create audio element for later use
                        window.preppedAudio = new Audio();
                        window.preppedAudio.volume = 0.8; // Set to actual volume
                        
                        // Play a very brief silent audio to unlock audio context for AI voices
                        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
                        silentAudio.volume = 0.01;
                        silentAudio.play().catch(() => {});
                        
                        console.log('Audio context prepped for mobile (preserving speech recognition beep)');
                        
                    } catch (error) {
                        console.log('Audio prep failed, but continuing');
                    }
                    
                    // Start voice input automatically
                    if (!recognition) {
                        if (!initSpeechRecognition()) {
                            alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
                            oneTimeBtn.disabled = false;
                            oneTimeBtn.textContent = '🎤 One-Tap Voice Ask';
                            return;
                        }
                    }
                    
                    // Start listening after audio context is ready (longer delay for mobile)
                    const delay = isMobileDevice() ? 1000 : 500; // Longer delay for mobile
                    console.log('🎤 SPEECH: Scheduling recognition start in', delay, 'ms');
                    setTimeout(() => {
                        try {
                            console.log('🎤 SPEECH: Starting recognition now, isListening:', isListening);
                            recognition.start();
                            console.log('🎤 SPEECH: recognition.start() called successfully');
                        } catch (error) {
                            console.error('🎤 SPEECH: Failed to start speech recognition:', error);
                            oneTimeBtn.disabled = false;
                            oneTimeBtn.textContent = '🎤 One-Tap Voice Ask';
                        }
                    }, delay);
                    
                    // Reset button after timeout
                    setTimeout(() => {
                        oneTimeBtn.disabled = false;
                        oneTimeBtn.textContent = '🎤 One-Tap Voice Ask';
                    }, 10000);
                }
                
                // Mobile detection function
                function isMobileDevice() {
                    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                           ('ontouchstart' in window) || 
                           (window.innerWidth <= 768);
                }
                
                // Initialize speech recognition on page load
                document.addEventListener('DOMContentLoaded', function() {
                    const isMobile = isMobileDevice();
                    console.log('Device detection: Mobile =', isMobile);
                    
                    if (isMobile) {
                        // Show voice features for mobile
                        document.getElementById('voiceSection').style.display = 'block';
                        document.getElementById('claudePrompt').placeholder = 'Type your question or use voice input...';
                        
                        // Initialize speech recognition
                        initSpeechRecognition();
                    } else {
                        // Desktop mode - hide voice features
                        document.getElementById('voiceSection').style.display = 'none';
                        document.getElementById('claudePrompt').placeholder = 'Type your question here...';
                        
                        console.log('Desktop detected: Voice features disabled');
                    }
                });
                
                // Handle enter key in textarea
                document.getElementById('claudePrompt').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        triggerClaude();
                    }
                });
                
                // Load available voices
                function loadVoices() {
                    const voiceSelect = document.getElementById('voiceSelect');
                    voiceSelect.innerHTML = '';
                    
                    // Add TTS Monster AI voices
                    const premiumVoices = [
                        { id: 'circuit', name: '🤖 Circuit - Electronic', description: 'Electronic robotic voice - default' },
                        { id: 'alpha', name: '🎭 Alpha - Male', description: 'Strong male voice' },
                        { id: 'aurora', name: '🌟 Aurora - Female', description: 'Bright female voice' },
                        { id: 'breeze', name: '🍃 Breeze - Female', description: 'Gentle female voice' },
                        { id: 'commander', name: '⚔️ Commander - Male', description: 'Authoritative military voice' },
                        { id: 'titan', name: '💪 Titan - Male', description: 'Deep powerful voice' },
                        { id: 'vera', name: '💼 Vera - Female', description: 'Professional female voice' },
                        { id: 'atlas', name: '🌍 Atlas - Male', description: 'Strong reliable voice' },
                        { id: 'axel', name: '⚡ Axel - Male', description: 'Energetic male voice' },
                        { id: 'blitz', name: '⚡ Blitz - Male', description: 'Fast-paced voice' },
                        { id: 'breaker', name: '🔨 Breaker - Male', description: 'Tough rugged voice' },
                        { id: 'chef', name: '👨‍🍳 Chef - Male', description: 'Friendly cooking voice' },
                        { id: 'dash', name: '🏃 Dash - Male', description: 'Quick energetic voice' },
                        { id: 'elder', name: '🧙 Elder - Male', description: 'Wise elderly voice' },
                        { id: 'frost', name: '❄️ Frost - Male', description: 'Cool calm voice' },
                        { id: 'hunter', name: '🏹 Hunter - Male', description: 'Focused tracking voice' },
                        { id: 'kawaii', name: '🌸 Kawaii - Female', description: 'Cute anime-style voice' },
                        { id: 'leader', name: '👑 Leader - Male', description: 'Commanding leadership voice' },
                        { id: 'mentor', name: '👨‍🏫 Mentor - Male', description: 'Teaching guidance voice' },
                        { id: 'reasonable', name: '🤝 Reasonable - Male', description: 'Calm logical voice' },
                        { id: 'scout', name: '🔍 Scout - Male', description: 'Alert exploration voice' },
                        { id: 'sentinel', name: '🛡️ Sentinel - Male', description: 'Protective guard voice' },
                        { id: 'star', name: '⭐ Star - Male', description: 'Bright stellar voice' },
                        { id: 'whisper', name: '🤫 Whisper - Male', description: 'Soft quiet voice' }
                    ];
                    
                    premiumVoices.forEach((voice) => {
                        const option = document.createElement('option');
                        option.value = voice.id;
                        option.textContent = voice.name;
                        option.title = voice.description;
                        
                        // Set Circuit as default
                        if (voice.id === 'circuit') {
                            option.selected = true;
                            option.textContent += ' ✨ (Default)';
                        }
                        
                        voiceSelect.appendChild(option);
                    });
                    
                    // Add separator
                    const separator = document.createElement('option');
                    separator.disabled = true;
                    separator.textContent = '── System Voices ──';
                    voiceSelect.appendChild(separator);
                    
                    // Add system voice option
                    const systemOption = document.createElement('option');
                    systemOption.value = 'system';
                    systemOption.textContent = '🔧 Enhanced System Voice';
                    systemOption.title = 'Best available browser voice with optimized settings';
                    voiceSelect.appendChild(systemOption);
                    
                    console.log('Loaded TTS Monster AI voices + enhanced system voice');
                }
                
                // Load voices immediately and on change
                loadVoices();
                if (speechSynthesis.onvoiceschanged !== undefined) {
                    speechSynthesis.onvoiceschanged = loadVoices;
                }
            </script>
        </body>
        </html>
    `);
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

        // Wait for additional response parts
        console.log('🎤 NODE: Waiting for additional response parts...');
        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds for additional parts

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
const RENEWAL_THRESHOLD = 2 * 60 * 60; // Renew if less than 2 hours remaining

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

            const files = await fs.readdir(CHANNELS_DIR);
            const channels = files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));

            let renewedCount = 0;
            let checkedCount = 0;

            for (const channel of channels) {
                try {
                    const config = await loadChannelConfig(channel);

                    if (!config?.oauth?.access_token) {
                        continue;
                    }

                    checkedCount++;

                    const shouldRenew = await this.shouldRenewToken(config.oauth.access_token);

                    if (shouldRenew) {
                        console.log(`Auto-renewing token for channel: ${channel}`);
                        const renewed = await this.renewToken(channel, config);

                        if (renewed) {
                            renewedCount++;
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

    async renewToken(channelName, config) {
        try {
            if (!config.oauth.refresh_token) {
                console.log(`No refresh token available for ${channelName}`);
                return false;
            }

            const response = await axios.post('https://id.twitch.tv/oauth2/token', {
                grant_type: 'refresh_token',
                refresh_token: config.oauth.refresh_token,
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET
            }, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            config.oauth.access_token = response.data.access_token;
            config.oauth.refresh_token = response.data.refresh_token;
            config.oauth.updated_at = new Date().toISOString();

            await saveChannelConfig(channelName, config);
            return true;

        } catch (error) {
            console.error(`Failed to auto-renew token for ${channelName}:`, error.response?.data || error.message);
            return false;
        }
    }
}

// Initialize renewal service
const renewalService = new TokenRenewalService();

// Start the server
app.listen(port, () => {
    console.log(`🔒 Secure Mr-AI-is-Here OAuth Manager listening at http://localhost:${port}`);
    console.log(`🌐 Public URL: https://mr-ai.dev/auth`);
    console.log(`🛡️ Security: Session-based authentication with channel ownership verification`);

    // Start auto-renewal service
    renewalService.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down Secure Mr-AI-is-Here OAuth Manager...');
    renewalService.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down Secure Mr-AI-is-Here OAuth Manager...');
    renewalService.stop();
    process.exit(0);
});