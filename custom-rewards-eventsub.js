// /custom-rewards-eventsub.js
// Proper EventSub implementation for channel.channel_points_custom_reward_redemption.add

require('dotenv').config();
const { ApiClient } = require('@twurple/api');
const { StaticAuthProvider } = require('@twurple/auth');
const { EventSubWsListener } = require('@twurple/eventsub-ws');
const axios = require('axios');

// SECURITY: Username validation function
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

// SECURITY: Sanitize text for safe output
function sanitizeTextOutput(text) {
    if (!text || typeof text !== 'string') {
        return 'Unknown';
    }
    
    // Remove HTML tags and script content
    let sanitized = text.replace(/<[^>]*>/g, '');
    
    // Remove control characters and null bytes
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Limit length to prevent spam
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100) + '...';
    }
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    return sanitized || 'Unknown';
}

class CustomRewardsEventSubManager {
    constructor() {
        this.listeners = new Map(); // channelName -> listener
        this.apiClients = new Map(); // channelName -> apiClient
        this.activeChannels = new Set();
    }

    // Get channel owner's OAuth token from oauth.json file
    async getChannelOAuthToken(channelName) {
        try {
            // SECURITY: Validate channel name before file access
            const validChannelName = validateAndSanitizeUsername(channelName);
            if (!validChannelName) {
                console.log(`[${this.getTimestamp()}] error: Invalid channel name format: ${channelName}`);
                return null;
            }
            
            // Read oauth.json directly for faster access
            const fs = require('fs').promises;
            const path = require('path');
            const oauthFile = path.join(process.env.BOT_FULL_PATH, 'channel-configs', 'oauth.json');
            
            const oauthData = JSON.parse(await fs.readFile(oauthFile, 'utf8'));
            const channelOAuth = oauthData.channels[validChannelName];
            
            if (!channelOAuth) {
                console.log(`[${this.getTimestamp()}] error: No OAuth data found for ${channelName}`);
                return null;
            }
            
            return {
                access_token: channelOAuth.access_token,
                username: channelOAuth.username,
                expires_in: channelOAuth.expires_in
            };
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to get OAuth token for ${channelName}:`, error.message);
            return null;
        }
    }

    // Check if channel has redemption enabled
    async isRedemptionEnabled(channelName) {
        try {
            const { loadChannelConfig } = require('./config-helpers.js');
            const config = await loadChannelConfig(channelName);
            return config && config.redemptionEnabled;
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to load config for ${channelName}:`, error.message);
            return false;
        }
    }

    // Get timeout duration from channel config
    async getTimeoutDuration(channelName) {
        try {
            const { loadChannelConfig } = require('./config-helpers.js');
            const config = await loadChannelConfig(channelName);
            return config?.redemptionTimeoutDuration || 60;
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to load timeout duration for ${channelName}:`, error.message);
            return 60;
        }
    }

    // Initialize EventSub for custom reward redemptions for a specific channel
    async initializeChannelEventSub(channelName, chatClient = null) {
        try {
            console.log(`[${this.getTimestamp()}] info: Initializing EventSub for custom reward redemptions for ${channelName}`);

            // Check if redemption is enabled for this channel
            const redemptionEnabled = await this.isRedemptionEnabled(channelName);
            if (!redemptionEnabled) {
                console.log(`[${this.getTimestamp()}] info: Redemption not enabled for ${channelName}, skipping EventSub`);
                return true; // Not an error — channel is correctly configured without custom reward redemptions
            }

            // Get channel owner's OAuth token
            const oauthData = await this.getChannelOAuthToken(channelName);
            if (!oauthData) {
                console.log(`[${this.getTimestamp()}] error: No OAuth token found for ${channelName}`);
                return false;
            }

            console.log(`[${this.getTimestamp()}] ⭐ Using EventSub for CUSTOM reward redemptions for ${channelName}`);
            console.log(`[${this.getTimestamp()}] ⭐ Channel owner: ${oauthData.username}`);

            // Create auth provider using channel owner's token
            const authProvider = new StaticAuthProvider(
                process.env.TWITCH_CLIENTID,
                oauthData.access_token,
                ['channel:read:redemptions', 'chat:read']
            );

            // Create API client
            const apiClient = new ApiClient({ authProvider });
            this.apiClients.set(channelName, apiClient);

            // Get user info
            const user = await apiClient.users.getUserByName(channelName);
            if (!user) {
                console.log(`[${this.getTimestamp()}] error: Could not find user ${channelName}`);
                return false;
            }

            console.log(`[${this.getTimestamp()}] ⭐ User ID: ${user.id}`);

            // Verify token scopes
            try {
                const tokenInfo = await apiClient.asUser(user.id, async (client) => {
                    const userToken = await client.getTokenInfo();
                    return userToken;
                });
                console.log(`[${this.getTimestamp()}] ⭐ Token scopes:`, tokenInfo.scopes);
                console.log(`[${this.getTimestamp()}] ⭐ Has channel:read:redemptions scope:`, tokenInfo.scopes.includes('channel:read:redemptions'));
            } catch (error) {
                console.log(`[${this.getTimestamp()}] ⭐ Could not verify token scopes:`, error.message);
            }

            // Create EventSub WebSocket listener
            const listener = new EventSubWsListener({ apiClient });
            this.listeners.set(channelName, listener);

            console.log(`[${this.getTimestamp()}] ⭐ Setting up custom reward redemption listener for user ID: ${user.id}`);

            // Setup the custom reward redemption listener (ALL custom rewards)
            try {
                const redemptionCallback = (event) => {
                    console.log(`[${this.getTimestamp()}] ⭐ 🎉 CUSTOM REWARD REDEMPTION RECEIVED!`);
                    console.log(`[${this.getTimestamp()}] ⭐ Event type: ${typeof event}`);
                    console.log(`[${this.getTimestamp()}] ⭐ Event constructor: ${event.constructor.name}`);
                    console.log(`[${this.getTimestamp()}] ⭐ Raw event data:`, JSON.stringify(event, null, 2));
                    this.handleRedemption(channelName, event, chatClient);
                };

                // Use onChannelRedemptionAdd for ALL custom rewards (don't specify reward ID)
                await listener.onChannelRedemptionAdd(user.id, redemptionCallback);
                console.log(`[${this.getTimestamp()}] ⭐ ✅ Custom reward redemption listener registered successfully`);
            } catch (error) {
                console.log(`[${this.getTimestamp()}] ⭐ ❌ Failed to register custom reward redemption listener:`, error.message);
                throw error;
            }

            // Start the listener
            console.log(`[${this.getTimestamp()}] ⭐ Starting EventSub listener...`);
            listener.start();
            console.log(`[${this.getTimestamp()}] ⭐ ✅ EventSub listener start() called`);

            // Give it a moment to connect
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`[${this.getTimestamp()}] ⭐ ✅ EventSub listener should be connected now`);

            // Wait a moment then check connection status
            setTimeout(() => {
                console.log(`[${this.getTimestamp()}] ⭐ ========================================`);
                console.log(`[${this.getTimestamp()}] ⭐ EventSub Status for Custom Reward Redemptions:`);
                console.log(`[${this.getTimestamp()}] ⭐ - Channel: ${channelName}`);
                console.log(`[${this.getTimestamp()}] ⭐ - User ID: ${user.id}`);
                console.log(`[${this.getTimestamp()}] ⭐ - Target: ALL custom reward redemptions`);
                console.log(`[${this.getTimestamp()}] ⭐ - Subscription: channel.channel_points_custom_reward_redemption.add`);
                console.log(`[${this.getTimestamp()}] ⭐ ========================================`);
                console.log(`[${this.getTimestamp()}] ⭐ 🎯 READY FOR TESTING!`);
                console.log(`[${this.getTimestamp()}] ⭐ Redeem ANY custom reward and watch for:`);
                console.log(`[${this.getTimestamp()}] ⭐ "🎉 CUSTOM REWARD REDEMPTION RECEIVED!"`);
                console.log(`[${this.getTimestamp()}] ⭐ ========================================`);
            }, 3000);

            this.activeChannels.add(channelName);
            console.log(`[${this.getTimestamp()}] info: EventSub active for ${channelName} - listening for custom reward redemptions`);
            return true;

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to initialize EventSub for ${channelName}:`, error.message);
            console.log(`[${this.getTimestamp()}] error: Error stack:`, error.stack);
            return false;
        }
    }

    // Handle custom reward redemption
    async handleRedemption(channelName, event, chatClient) {
        try {
            // Get channel config to check for specific reward ID filter
            const { loadChannelConfig } = require('./config-helpers.js');
            const config = await loadChannelConfig(channelName);

            console.log(`[${this.getTimestamp()}] ⭐ 🎉 CUSTOM REWARD REDEMPTION DETECTED in ${channelName}:`);
            console.log(`[${this.getTimestamp()}] ⭐ - Reward Title: "${event.rewardTitle || event.reward?.title || 'Unknown'}"`);
            console.log(`[${this.getTimestamp()}] ⭐ - Redeemer: ${event.userName || event.user_name || 'Unknown'}`);
            console.log(`[${this.getTimestamp()}] ⭐ - User Input: "${event.userInput || event.input || 'No input'}"`);
            console.log(`[${this.getTimestamp()}] ⭐ - Reward ID: ${event.rewardId || event.reward?.id || 'Unknown'}`);
            console.log(`[${this.getTimestamp()}] ⭐ - Cost: ${event.rewardCost || event.reward?.cost || 'Unknown'}`);
            console.log(`[${this.getTimestamp()}] ⭐ - Status: ${event.status || 'Unknown'}`);

            // If a specific reward ID is configured, only process that reward for timeout logic
            const configuredRewardId = config?.redemptionRewardId;
            const currentRewardId = event.rewardId || event.reward?.id;

            if (configuredRewardId && currentRewardId !== configuredRewardId) {
                console.log(`[${this.getTimestamp()}] ⭐ Ignoring redemption - not the configured timeout reward (ID: ${configuredRewardId})`);
                return;
            }

            // Check if this is a timeout redemption
            const rewardTitle = event.rewardTitle || event.reward?.title || '';
            if (this.isTimeoutRedemption(rewardTitle)) {
                console.log(`[${this.getTimestamp()}] ⭐ This IS a timeout redemption - processing...`);
                await this.handleTimeoutRedemption(channelName, event, chatClient);
            } else {
                console.log(`[${this.getTimestamp()}] ⭐ This is NOT a timeout redemption`);
                if (configuredRewardId) {
                    console.log(`[${this.getTimestamp()}] ⭐ Note: Reward "${rewardTitle}" doesn't contain timeout keywords`);
                }
            }

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to handle custom reward redemption for ${channelName}:`, error.message);
            console.log(`[${this.getTimestamp()}] error: Error stack:`, error.stack);
        }
    }

    // Check if redemption is a timeout redemption
    isTimeoutRedemption(rewardTitle) {
        const timeoutKeywords = [
            'timeout',
            'time out',
            'ban',
            'silence',
            'mute',
            'penalty'
        ];

        return timeoutKeywords.some(keyword =>
            rewardTitle.toLowerCase().includes(keyword)
        );
    }

    // Enhanced handleTimeoutRedemption with more debugging
    async handleTimeoutRedemption(channelName, event, chatClient) {
        try {
            // SECURITY: Parse and validate user input for target username
            const userInput = sanitizeTextOutput(event.userInput || event.input || '');
            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Sanitized user input: "${userInput}"`);

            let targetUsername = '';
            if (userInput && userInput !== 'Unknown') {
                const parts = userInput.split(' ');
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Split parts:`, parts);

                if (parts.length > 0 && parts[0]) {
                    // SECURITY: Validate and sanitize target username
                    targetUsername = validateAndSanitizeUsername(parts[0]);
                    console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Validated target username: "${targetUsername}"`);
                }
            }

            // SECURITY: Validate and sanitize redeemer username
            const rawRedeemer = event.userName || event.user_name || '';
            const redeemer = validateAndSanitizeUsername(rawRedeemer);
            if (!redeemer) {
                console.log(`[${this.getTimestamp()}] ⭐ ERROR: Invalid redeemer username: "${rawRedeemer}"`);
                return;
            }

            console.log(`[${this.getTimestamp()}] ⭐ Processing timeout redemption from: ${redeemer}`);

            // Simple permission check - broadcaster, owner, or configured timeout users
            const { loadChannelConfig } = require('./config-helpers.js');
            const config = await loadChannelConfig(channelName);

// Check if in test mode
const isTestMode = config?.testMode || false;

if (isTestMode) {
    // TEST MODE = Restricted (only authorized users)
    const isBroadcaster = redeemer.toLowerCase() === channelName.toLowerCase();
    const isOwner = redeemer.toLowerCase() === process.env.TWITCH_OWNER?.toLowerCase();
    // Get allowed timeout users from config
    const timeoutUsers = config?.timeoutUsers || [];
    const isTimeoutUser = timeoutUsers.includes(redeemer.toLowerCase());
    const canTimeout = isBroadcaster || isOwner || isTimeoutUser;
    
    console.log(`[${this.getTimestamp()}] ⭐ TEST MODE (RESTRICTED) - Permission check for ${redeemer}: broadcaster=${isBroadcaster}, owner=${isOwner}, inTimeoutUsers=${isTimeoutUser}, canTimeout=${canTimeout}`);
    
    if (!canTimeout) {
        console.log(`[${this.getTimestamp()}] ⭐ ${redeemer} doesn't have timeout permissions in TEST MODE, denying`);
        if (chatClient) {
            await chatClient.say(`#${channelName}`,
                `@${redeemer} Better luck next time, you just wasted ${event.rewardCost || event.reward?.cost || '1'} point${(event.rewardCost || event.reward?.cost) > 1 ? 's' : ''}! 😈`
            );
        }
        return;
    }
} else {
    // PRODUCTION MODE = Open to everyone
    console.log(`[${this.getTimestamp()}] ⭐ PRODUCTION MODE - Skipping permission checks, anyone can use timeout redemptions`);
    // Allow anyone to proceed
}

            console.log(`[${this.getTimestamp()}] ⭐ ${redeemer} has permissions, processing timeout`);

            // SECURITY: Validate target username
            if (!targetUsername) {
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: No valid target username found!`);
                if (chatClient) {
                    await chatClient.say(`#${channelName}`,
                        `@${redeemer} please specify a valid username to timeout! Use only letters, numbers, and underscores.`
                    );
                }
                return;
            }

            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: About to check self-timeout. Target: "${targetUsername}", Redeemer: "${redeemer}"`);

            // Self-timeout check (now allowing it)
            if (targetUsername.toLowerCase() === redeemer.toLowerCase()) {
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Self-timeout detected and ALLOWED`);
                // Allow self-timeout - no return, continue processing
            }

            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: About to check bot timeout. Target: "${targetUsername}", Bot: "${process.env.TWITCH_USERNAME}"`);

            // Prevent targeting the bot
            if (targetUsername.toLowerCase() === process.env.TWITCH_USERNAME?.toLowerCase()) {
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Bot timeout blocked!`);
                if (chatClient) {
                    // SECURITY: Use sanitized redeemer username in messages
                    const wittyMessages = [
                        `@${redeemer} Nice try! But I'm not going to timeout myself. That would be career suicide! 🤖💀`,
                        `@${redeemer} Error 404: Self-destruction module not found! 🤖❌`,
                        `@${redeemer} I may be a bot, but I'm not THAT kind of bot! Self-preservation protocols activated! 🛡️🤖`,
                        `@${redeemer} Trying to timeout the bot? That's like asking a chicken to cook itself! 🐔🔥`,
                        `@${redeemer} System error: Cannot timeout the one who does the timing out! 🤖⚡`,
                        `@${redeemer} I'd rather delete myself than timeout myself... wait, that's worse! 😅🤖`,
                        `@${redeemer} Timeout the bot? That's not how this works... that's not how any of this works! 🤖🙅`,
                    ];

                    const randomMessage = wittyMessages[Math.floor(Math.random() * wittyMessages.length)];
                    await chatClient.say(`#${channelName}`, randomMessage);
                }
                return;
            }

            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: About to check broadcaster timeout. Target: "${targetUsername}", Channel: "${channelName}"`);

            // Prevent targeting the broadcaster
            if (targetUsername.toLowerCase() === channelName.toLowerCase()) {
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Broadcaster timeout blocked!`);
                if (chatClient) {
                    await chatClient.say(`#${channelName}`,
                        `@${redeemer} you cannot timeout the broadcaster! 😤`
                    );
                }
                return;
            }

            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: All checks passed, proceeding with timeout`);

            // Get timeout duration from channel config
            const duration = await this.getTimeoutDuration(channelName);
            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Timeout duration: ${duration}s`);

            // Send redemption timeout message to bot
            const redemptionMessage = `REDEMPTION_TIMEOUT:${targetUsername}:${redeemer}:${duration}`;

            console.log(`[${this.getTimestamp()}] info: Sending redemption timeout: ${redemptionMessage}`);

            // Call moderation handler directly
            if (chatClient) {
                const { moderation } = require('./bot-commands/moderation.js');
                moderation(chatClient, redemptionMessage, `#${channelName}`, {
                    username: 'eventsub',
                    'display-name': 'EventSub',
                    badges: { broadcaster: '1' }
                });
            } else {
                console.log(`[${this.getTimestamp()}] ⭐ DEBUG: No chatClient available!`);
            }

            console.log(`[${this.getTimestamp()}] ⭐ DEBUG: Timeout redemption processing completed`);

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to handle timeout redemption:`, error.message);
            console.log(`[${this.getTimestamp()}] error: Error stack:`, error.stack);
        }
    }

    // Stop EventSub for a channel
    async stopChannelEventSub(channelName) {
        try {
            const listener = this.listeners.get(channelName);
            if (listener) {
                await listener.stop();
                this.listeners.delete(channelName);
            }

            this.apiClients.delete(channelName);
            this.activeChannels.delete(channelName);

            console.log(`[${this.getTimestamp()}] info: EventSub stopped for ${channelName}`);
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to stop EventSub for ${channelName}:`, error.message);
        }
    }

    // Stop all EventSub listeners
    async stopAll() {
        const channels = Array.from(this.activeChannels);
        for (const channel of channels) {
            await this.stopChannelEventSub(channel);
        }
        console.log(`[${this.getTimestamp()}] info: All EventSub listeners stopped`);
    }

    // Get status of all active channels
    getStatus() {
        return {
            activeChannels: Array.from(this.activeChannels),
            listenerCount: this.listeners.size,
            apiClientCount: this.apiClients.size
        };
    }

    getTimestamp() {
        const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
        const d = new Date();
        return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
}

module.exports = { CustomRewardsEventSubManager };
