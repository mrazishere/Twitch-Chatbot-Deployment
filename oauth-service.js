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
function generateChannelAuthUrl(channelName, scopes = 'chat:read channel:read:redemptions') {
    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scopes,
        state: `channel_auth:${channelName}`
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
            <title>Mr-AI-is-Here OAuth Manager</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background-color: #f8f9fa; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                h1 { color: #9146ff; text-align: center; margin-bottom: 30px; }
                .login-section { text-align: center; padding: 30px; background-color: #f8f9fa; border-radius: 8px; margin: 20px 0; }
                .auth-btn { background-color: #9146ff; color: white; border: none; padding: 15px 30px; font-size: 18px; cursor: pointer; border-radius: 6px; text-decoration: none; display: inline-block; }
                .auth-btn:hover { background-color: #7c3aed; }
                .info { background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .security-note { background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
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
        moderatorUsername: username,
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
                <title>Mr-AI-is-Here OAuth Manager - ${username}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background-color: #f8f9fa; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #9146ff; margin-bottom: 10px; }
                    .user-info { background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
                    .security-badge { background-color: #d4edda; padding: 10px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745; }
                    .actions { text-align: center; margin: 30px 0; }
                    .info { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
                    .logout { text-align: center; margin-top: 40px; }
                    .logout a { color: #6c757d; text-decoration: none; margin: 0 10px; }
                    .logout a:hover { text-decoration: underline; }
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

    const channelName = state.replace('channel_auth:', '');

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

// API endpoint to get OAuth token for bot use (unchanged - this stays the same for bot access)
app.get('/auth/token', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) {
        return res.status(400).json({ error: 'Channel parameter is required' });
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