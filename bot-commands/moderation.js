// /bot-commands/moderation.js
// Moderation commands for multi-channel bot with per-channel OAuth support

const fs = require('fs');
const path = require('path');

function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper function to clean username (remove @ if present)
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

// Get API clients for the channel
async function getApiClients(channelName) {
    const { ApiClient } = require('@twurple/api');
    const { StaticAuthProvider } = require('@twurple/auth');

    const channelConfig = loadChannelConfig(channelName);
    if (!channelConfig || !channelConfig.moderationEnabled) {
        return { chatApi: null, moderationApi: null, config: null };
    }

    // Chat API client (for user lookups)
    const chatAuthProvider = new StaticAuthProvider(
        process.env.TWITCH_CLIENTID,
        process.env.TWITCH_OAUTH.replace('oauth:', ''),
        ['chat:read', 'chat:edit']
    );
    const chatApi = new ApiClient({ authProvider: chatAuthProvider });

    // Moderation API client (for moderation actions)
    const moderationAuthProvider = new StaticAuthProvider(
        channelConfig.clientId,
        channelConfig.oauthToken.replace('oauth:', ''),
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

// Timeout user function
async function timeoutUser(channelName, username, duration = 600, reason = '') {
    // Clean the username (remove @ if present)
    const cleanedUsername = cleanUsername(username);

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return { success: false, message: "Moderation not configured for this channel" };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Attempting timeout ${cleanedUsername} for ${duration}s (original input: ${username})`);

        // Get user information
        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const moderator = await moderationApi.users.getUserByName(config.moderatorUsername);

        if (!broadcaster || !user || !moderator) {
            console.log(`[${getTimestamp()}] error: User lookup failed for ${cleanedUsername}`);
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call to Twitch (bypassing Twurple's buggy banUser method)
        const fetch = require('node-fetch');
        const banUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${moderator.id}`;

        const banPayload = {
            data: {
                user_id: user.id,
                duration: duration,
                reason: reason
            }
        };

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(banUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': config.clientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(banPayload)
        });

        if (response.ok) {
            console.log(`[${getTimestamp()}] info: Successfully timed out ${cleanedUsername} for ${duration}s`);
            return { success: true, message: `Timed out ${cleanedUsername} for ${duration}s` };
        } else {
            const responseData = await response.json();
            console.log(`[${getTimestamp()}] error: Timeout failed:`, responseData);
            return { success: false, message: `Timeout failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Timeout failed:`, error.message);
        return { success: false, message: `Timeout failed: ${error.message}` };
    }
}

// Ban user function
async function banUser(channelName, username, reason = '') {
    // Clean the username (remove @ if present)
    const cleanedUsername = cleanUsername(username);

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return { success: false, message: "Moderation not configured for this channel" };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Attempting to ban ${cleanedUsername} (original input: ${username})`);

        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const moderator = await moderationApi.users.getUserByName(config.moderatorUsername);

        if (!broadcaster || !user || !moderator) {
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call for permanent ban
        const fetch = require('node-fetch');
        const banUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${moderator.id}`;

        const banPayload = {
            data: {
                user_id: user.id,
                reason: reason
            }
        };

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(banUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': config.clientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(banPayload)
        });

        if (response.ok) {
            console.log(`[${getTimestamp()}] info: Successfully banned ${cleanedUsername}`);
            return { success: true, message: `Banned ${cleanedUsername}` };
        } else {
            const responseData = await response.json();
            return { success: false, message: `Ban failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Ban failed:`, error.message);
        return { success: false, message: `Ban failed: ${error.message}` };
    }
}

// Unban user function
async function unbanUser(channelName, username) {
    // Clean the username (remove @ if present)
    const cleanedUsername = cleanUsername(username);

    const { chatApi, moderationApi, moderationAuthProvider, config } = await getApiClients(channelName);

    if (!moderationApi) {
        return { success: false, message: "Moderation not configured for this channel" };
    }

    try {
        console.log(`[${getTimestamp()}] info: Moderation: Attempting to unban ${cleanedUsername} (original input: ${username})`);

        const broadcaster = await chatApi.users.getUserByName(channelName);
        const user = await moderationApi.users.getUserByName(cleanedUsername);
        const moderator = await moderationApi.users.getUserByName(config.moderatorUsername);

        if (!broadcaster || !user || !moderator) {
            return { success: false, message: `User lookup failed for ${cleanedUsername}` };
        }

        // Direct API call for unban
        const fetch = require('node-fetch');
        const unbanUrl = `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${moderator.id}&user_id=${user.id}`;

        const token = await moderationAuthProvider.getAccessTokenForUser();
        const response = await fetch(unbanUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token.accessToken}`,
                'Client-Id': config.clientId
            }
        });

        if (response.status === 204) { // 204 = No Content (success for DELETE)
            console.log(`[${getTimestamp()}] info: Successfully unbanned ${cleanedUsername}`);
            return { success: true, message: `Unbanned ${cleanedUsername}` };
        } else {
            const responseData = await response.json();
            return { success: false, message: `Unban failed: ${responseData.message || 'API Error'}` };
        }

    } catch (error) {
        console.log(`[${getTimestamp()}] error: Unban failed:`, error.message);
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
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isOwner = tags.username === process.env.TWITCH_OWNER;
    const isModUp = isBroadcaster || isMod || isOwner;

    // Handle channel point redemption timeouts
    if (message.startsWith('REDEMPTION_TIMEOUT:')) {
        console.log(`[${getTimestamp()}] info: Processing channel point redemption timeout`);

        // Parse redemption data: "REDEMPTION_TIMEOUT:username:redeemer:duration"
        const parts = message.split(':');
        if (parts.length >= 4) {
            const targetUsername = cleanUsername(parts[1]); // Clean the target username
            const redeemerUsername = parts[2];
            const duration = parseInt(parts[3]) || 60;

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
    }
}

module.exports = { moderation };