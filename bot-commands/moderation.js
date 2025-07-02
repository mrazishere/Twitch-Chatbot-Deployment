// /bot-commands/moderation.js
// Moderation commands using bot's OAuth token for all moderation actions

const fs = require('fs');
const path = require('path');

function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// SECURITY: Validation and sanitization functions
function validateAndSanitizeUsername(username) {
    if (!username || typeof username !== 'string') {
        return null;
    }
    
    // Remove @ symbol if present
    let cleaned = username.startsWith('@') ? username.slice(1) : username;
    
    // Twitch username validation: 4-25 chars, alphanumeric + underscore only
    const twitchUsernameRegex = /^[a-zA-Z0-9_]{4,25}$/;
    if (!twitchUsernameRegex.test(cleaned)) {
        return null;
    }
    
    return cleaned.toLowerCase();
}

function sanitizeReason(reason) {
    if (!reason || typeof reason !== 'string') {
        return 'No reason provided';
    }
    
    // Remove HTML tags and script content
    let sanitized = reason.replace(/<[^>]*>/g, '');
    
    // Remove control characters and null bytes
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Limit length to prevent spam
    if (sanitized.length > 200) {
        sanitized = sanitized.substring(0, 200) + '...';
    }
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized || 'No reason provided';
}

function validateTimeoutDuration(duration) {
    const numDuration = parseInt(duration);
    
    // Must be a valid number
    if (isNaN(numDuration) || numDuration <= 0) {
        return { valid: false, duration: 600, error: 'Invalid duration format' };
    }
    
    // Twitch API limits: 1 second to 1209600 seconds (14 days)
    if (numDuration > 1209600) {
        return { valid: false, duration: 600, error: 'Duration too long (max 14 days)' };
    }
    
    if (numDuration < 1) {
        return { valid: false, duration: 600, error: 'Duration too short (min 1 second)' };
    }
    
    return { valid: true, duration: numDuration, error: null };
}

// Helper function to clean username (remove @ if present) - DEPRECATED, use validateAndSanitizeUsername
function cleanUsername(username) {
    if (!username) return username;
    return username.startsWith('@') ? username.slice(1) : username;
}

// Load channel configuration
function loadChannelConfig(channelName) {
    const configPath = `${process.env.BOT_FULL_PATH}/channel-configs/${channelName}.json`;
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.log(`[${getTimestamp()}] error: Failed to load config for ${channelName}:`, error.message);
    }
    return null;
}

// SIMPLIFIED: Get API clients using bot's OAuth token only
async function getApiClients(channelName) {
    const { ApiClient } = require('@twurple/api');
    const { StaticAuthProvider } = require('@twurple/auth');

    const channelConfig = loadChannelConfig(channelName);
    if (!channelConfig || !channelConfig.moderationEnabled) {
        return { chatApi: null, moderationApi: null, config: null };
    }

    // Bot's OAuth token from environment variables
    const botOAuthToken = process.env.TWITCH_OAUTH.replace('oauth:', '');

    console.log(`[${getTimestamp()}] info: Using bot's OAuth token for moderation in ${channelName}`);

    // Chat API client (for user lookups) - using bot's OAuth
    const chatAuthProvider = new StaticAuthProvider(
        process.env.TWITCH_CLIENTID,
        botOAuthToken,
        ['chat:read', 'chat:edit']
    );
    const chatApi = new ApiClient({ authProvider: chatAuthProvider });

    // Moderation API client (for moderation actions) - using bot's OAuth
    const moderationAuthProvider = new StaticAuthProvider(
        process.env.TWITCH_CLIENTID,
        botOAuthToken,
        [
            'chat:read',
            'chat:edit',
            'moderator:manage:banned_users',
            'moderator:read:blocked_terms',
            'moderator:manage:blocked_terms',
            'moderator:manage:automod'
        ]
    );
    const moderationApi = new ApiClient({ authProvider: moderationAuthProvider });

    return { chatApi, moderationApi, moderationAuthProvider, config: channelConfig };
}

// UPDATED: Timeout user function using bot's OAuth
async function timeoutUser(channelName, username, duration = 600, reason = '') {
    // SECURITY: Validate and sanitize all inputs
    const cleanedUsername = validateAndSanitizeUsername(username);
    if (!cleanedUsername) {
        return {
            success: false,
            message: `Invalid username format: ${username}. Use only letters, numbers, and underscores (4-25 chars).`
        };
    }
    
    const durationCheck = validateTimeoutDuration(duration);
    if (!durationCheck.valid) {
        return {
            success: false,
            message: `Invalid timeout duration: ${durationCheck.error}`
        };
    }
    const validDuration = durationCheck.duration;
    
    const sanitizedReason = sanitizeReason(reason);

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return {
            success: false,
            message: "Moderation not configured for this channel"
        };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Bot attempting timeout ${cleanedUsername} for ${validDuration}s (original input: ${username})`);

        // Get user information - bot looks up broadcaster, target user, and itself as moderator
        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const botModerator = await moderationApi.users.getUserByName(process.env.TWITCH_USERNAME); // Bot as moderator

        if (!broadcaster || !user || !botModerator) {
            console.log(`[${getTimestamp()}] error: User lookup failed for ${cleanedUsername}`);
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call to Twitch using bot as the moderator
        const fetch = require('node-fetch');
        const banUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${botModerator.id}`;

        const banPayload = {
            data: {
                user_id: user.id,
                duration: validDuration,
                reason: sanitizedReason
            }
        };

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(banUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': process.env.TWITCH_CLIENTID,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(banPayload)
        });

        if (response.ok) {
            console.log(`[${getTimestamp()}] info: Bot successfully timed out ${cleanedUsername} for ${validDuration}s`);
            return { success: true, message: `Timed out ${cleanedUsername} for ${validDuration}s` };
        } else {
            const responseData = await response.json();
            console.log(`[${getTimestamp()}] error: Timeout failed:`, responseData);

            // Handle specific error cases
            if (responseData.message && responseData.message.includes('insufficient privileges')) {
                return { success: false, message: `Bot lacks moderation permissions. Ensure bot is a moderator in this channel (/mod ${process.env.TWITCH_USERNAME})` };
            } else if (responseData.message && responseData.message.includes('token')) {
                return { success: false, message: `Bot's OAuth token issue. Check bot authentication.` };
            }

            return { success: false, message: `Timeout failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Timeout failed:`, error.message);

        // Handle OAuth-related errors
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            return { success: false, message: `Bot's OAuth token expired or invalid. Check bot authentication.` };
        }

        return { success: false, message: `Timeout failed: ${error.message}` };
    }
}

// UPDATED: Ban user function using bot's OAuth
async function banUser(channelName, username, reason = '') {
    // SECURITY: Validate and sanitize all inputs
    const cleanedUsername = validateAndSanitizeUsername(username);
    if (!cleanedUsername) {
        return {
            success: false,
            message: `Invalid username format: ${username}. Use only letters, numbers, and underscores (4-25 chars).`
        };
    }
    
    const sanitizedReason = sanitizeReason(reason);

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return {
            success: false,
            message: "Moderation not configured for this channel"
        };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Bot attempting to ban ${cleanedUsername} (original input: ${username})`);

        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const botModerator = await moderationApi.users.getUserByName(process.env.TWITCH_USERNAME); // Bot as moderator

        if (!broadcaster || !user || !botModerator) {
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call for permanent ban
        const fetch = require('node-fetch');
        const banUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${botModerator.id}`;

        const banPayload = {
            data: {
                user_id: user.id,
                reason: sanitizedReason
            }
        };

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(banUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': process.env.TWITCH_CLIENTID,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(banPayload)
        });

        if (response.ok) {
            console.log(`[${getTimestamp()}] info: Bot successfully banned ${cleanedUsername}`);
            return { success: true, message: `Banned ${cleanedUsername}` };
        } else {
            const responseData = await response.json();

            // Handle specific error cases
            if (responseData.message && responseData.message.includes('insufficient privileges')) {
                return { success: false, message: `Bot lacks moderation permissions. Ensure bot is a moderator in this channel (/mod ${process.env.TWITCH_USERNAME})` };
            } else if (responseData.message && responseData.message.includes('token')) {
                return { success: false, message: `Bot's OAuth token issue. Check bot authentication.` };
            }

            return { success: false, message: `Ban failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Ban failed:`, error.message);

        // Handle OAuth-related errors
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            return { success: false, message: `Bot's OAuth token expired or invalid. Check bot authentication.` };
        }

        return { success: false, message: `Ban failed: ${error.message}` };
    }
}

// UPDATED: Unban user function using bot's OAuth
async function unbanUser(channelName, username) {
    // SECURITY: Validate and sanitize username
    const cleanedUsername = validateAndSanitizeUsername(username);
    if (!cleanedUsername) {
        return {
            success: false,
            message: `Invalid username format: ${username}. Use only letters, numbers, and underscores (4-25 chars).`
        };
    }

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return {
            success: false,
            message: "Moderation not configured for this channel"
        };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Bot attempting to unban ${cleanedUsername} (original input: ${username})`);

        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const botModerator = await moderationApi.users.getUserByName(process.env.TWITCH_USERNAME); // Bot as moderator

        if (!broadcaster || !user || !botModerator) {
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call for unban
        const fetch = require('node-fetch');
        const unbanUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${botModerator.id}&user_id=${user.id}`;

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(unbanUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': process.env.TWITCH_CLIENTID
            }
        });

        if (response.status === 204) { // 204 = No Content (success for DELETE)
            console.log(`[${getTimestamp()}] info: Bot successfully unbanned ${cleanedUsername}`);
            return { success: true, message: `Unbanned ${cleanedUsername}` };
        } else {
            const responseData = await response.json();

            // Handle specific error cases
            if (responseData.message && responseData.message.includes('insufficient privileges')) {
                return { success: false, message: `Bot lacks moderation permissions. Ensure bot is a moderator in this channel (/mod ${process.env.TWITCH_USERNAME})` };
            } else if (responseData.message && responseData.message.includes('token')) {
                return { success: false, message: `Bot's OAuth token issue. Check bot authentication.` };
            }

            return { success: false, message: `Unban failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Unban failed:`, error.message);

        // Handle OAuth-related errors
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            return { success: false, message: `Bot's OAuth token expired or invalid. Check bot authentication.` };
        }

        return { success: false, message: `Unban failed: ${error.message}` };
    }
}

// Main moderation command handler
function moderation(client, message, channel, tags) {
    const args = message.split(' ');
    const command = args[0].toLowerCase();
    const channelName = channel.replace('#', '');

    // Check if user has moderation permissions
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
    const isMod = badges.moderator || tags.isMod;
    const isOwner = tags.username === process.env.TWITCH_OWNER;
    const isModUp = isBroadcaster || isMod || isOwner;

    // Handle channel point redemption timeouts
    if (message.startsWith('REDEMPTION_TIMEOUT:')) {
        console.log(`[${getTimestamp()}] info: Processing channel point redemption timeout`);

        // SECURITY: Parse and validate redemption data: "REDEMPTION_TIMEOUT:username:redeemer:duration"
        const parts = message.split(':');
        if (parts.length >= 4) {
            // SECURITY: Validate target username
            const targetUsername = validateAndSanitizeUsername(parts[1]);
            if (!targetUsername) {
                console.log(`[${getTimestamp()}] error: Invalid target username in redemption: ${parts[1]}`);
                return;
            }
            
            // SECURITY: Validate redeemer username  
            const redeemerUsername = validateAndSanitizeUsername(parts[2]);
            if (!redeemerUsername) {
                console.log(`[${getTimestamp()}] error: Invalid redeemer username in redemption: ${parts[2]}`);
                return;
            }
            
            // SECURITY: Validate duration
            const durationCheck = validateTimeoutDuration(parts[3]);
            if (!durationCheck.valid) {
                console.log(`[${getTimestamp()}] error: Invalid duration in redemption: ${parts[3]} - ${durationCheck.error}`);
                return;
            }
            const duration = durationCheck.duration;

            console.log(`[${getTimestamp()}] info: Redemption timeout: ${redeemerUsername} wants to timeout ${targetUsername} for ${duration}s (cleaned from: ${parts[1]})`);

            timeoutUser(channelName, targetUsername, duration, `Channel point redemption by ${redeemerUsername}`)
                .then(result => {
                    if (result.success) {
                        client.say(channel, `@${redeemerUsername} redeemed a ${duration}s timeout for @${targetUsername}! ${result.message}`);
                    } else {
                        client.say(channel, `@${redeemerUsername} timeout redemption failed: ${result.message}`);
                    }
                })
                .catch(error => {
                    console.log(`[${getTimestamp()}] error: Redemption timeout error:`, error.message);
                    client.say(channel, `@${redeemerUsername} timeout redemption failed due to an error`);
                });
        }
        return;
    }

    if (!isModUp) {
        return; // Not a moderator, ignore command
    }

    // Handle moderation commands
    switch (command) {
        case '!timeout':
            if (args[1]) {
                // SECURITY: Input validation handled by timeoutUser function
                const duration = args[2] ? parseInt(args[2]) : 600; // Default 10 minutes
                const reason = args.slice(3).join(' ') || 'No reason provided';

                console.log(`[${getTimestamp()}] info: Processing !timeout ${args[1]} ${duration} by ${tags.username}`);

                timeoutUser(channelName, args[1], duration, reason)
                    .then(result => {
                        client.say(channel, result.message);
                    })
                    .catch(error => {
                        console.log(`[${getTimestamp()}] error: Timeout command error:`, error.message);
                        client.say(channel, "Timeout command failed");
                    });
            } else {
                client.say(channel, "Usage: !timeout <username> [seconds] [reason] (@ symbol optional)");
            }
            break;

        case '!ban':
            if (args[1]) {
                // SECURITY: Input validation handled by banUser function
                const reason = args.slice(2).join(' ') || 'No reason provided';

                console.log(`[${getTimestamp()}] info: Processing !ban ${args[1]} by ${tags.username}`);

                banUser(channelName, args[1], reason)
                    .then(result => {
                        client.say(channel, result.message);
                    })
                    .catch(error => {
                        console.log(`[${getTimestamp()}] error: Ban command error:`, error.message);
                        client.say(channel, "Ban command failed");
                    });
            } else {
                client.say(channel, "Usage: !ban <username> [reason] (@ symbol optional)");
            }
            break;

        case '!unban':
            if (args[1]) {
                // SECURITY: Input validation handled by unbanUser function
                console.log(`[${getTimestamp()}] info: Processing !unban ${args[1]} by ${tags.username}`);

                unbanUser(channelName, args[1])
                    .then(result => {
                        client.say(channel, result.message);
                    })
                    .catch(error => {
                        console.log(`[${getTimestamp()}] error: Unban command error:`, error.message);
                        client.say(channel, "Unban command failed");
                    });
            } else {
                client.say(channel, "Usage: !unban <username> (@ symbol optional)");
            }
            break;

        // UPDATED: Bot OAuth status command
        case '!botstatus':
            if (isModUp) {
                const botOAuthToken = process.env.TWITCH_OAUTH;
                if (botOAuthToken && botOAuthToken !== 'oauth:pending_oauth_generation') {
                    client.say(channel, `✅ Bot OAuth token is configured. Bot can perform moderation actions if it has moderator status.`);
                } else {
                    client.say(channel, `❌ Bot OAuth token not configured. Check bot's .env file.`);
                }
            }
            break;
    }
}

module.exports = { moderation };