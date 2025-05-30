// /eventsub-redemptions.js
// EventSub system for channel point redemptions using channel owner's OAuth

require('dotenv').config();
const { ApiClient } = require('@twurple/api');
const { StaticAuthProvider } = require('@twurple/auth');
const { EventSubWsListener } = require('@twurple/eventsub-ws');
const axios = require('axios');

class RedemptionEventSubManager {
    constructor() {
        this.listeners = new Map(); // channelName -> listener
        this.apiClients = new Map(); // channelName -> apiClient
        this.activeChannels = new Set();
    }

    // Get channel owner's OAuth token from the OAuth manager
    async getChannelOAuthToken(channelName) {
        try {
            const response = await axios.get(`http://localhost:3001/auth/token?channel=${channelName}`);
            return response.data;
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to get OAuth token for ${channelName}:`, error.message);
            return null;
        }
    }

    // Check if channel has redemption enabled
    async isRedemptionEnabled(channelName) {
        try {
            const { loadChannelConfig } = require('./oauth-manager.js'); // Adjust path as needed
            const config = await loadChannelConfig(channelName);
            return config && config.redemptionEnabled;
        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to load config for ${channelName}:`, error.message);
            return false;
        }
    }

    // Initialize EventSub for a specific channel
    async initializeChannelEventSub(channelName, chatClient = null) {
        try {
            console.log(`[${this.getTimestamp()}] info: Initializing EventSub for ${channelName}`);

            // Check if redemption is enabled for this channel
            const redemptionEnabled = await this.isRedemptionEnabled(channelName);
            if (!redemptionEnabled) {
                console.log(`[${this.getTimestamp()}] info: Redemption not enabled for ${channelName}, skipping EventSub`);
                return false;
            }

            // Get channel owner's OAuth token
            const oauthData = await this.getChannelOAuthToken(channelName);
            if (!oauthData) {
                console.log(`[${this.getTimestamp()}] error: No OAuth token found for ${channelName}`);
                return false;
            }

            // Create auth provider using channel owner's token
            const authProvider = new StaticAuthProvider(
                process.env.TWITCH_CLIENTID,
                oauthData.access_token,
                ['chat:read', 'chat:edit', 'channel:moderate', 'moderator:manage:banned_users', 'channel:read:redemptions']
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

            // Create EventSub WebSocket listener
            const listener = new EventSubWsListener({ apiClient });
            this.listeners.set(channelName, listener);

            // Listen for channel point redemptions
            await listener.onChannelRedemptionAdd(user.id, (event) => {
                this.handleRedemption(channelName, event, chatClient);
            });

            // Start the listener
            await listener.start();

            this.activeChannels.add(channelName);
            console.log(`[${this.getTimestamp()}] info: EventSub active for ${channelName} - listening for redemptions`);
            return true;

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to initialize EventSub for ${channelName}:`, error.message);
            return false;
        }
    }

    // Handle channel point redemption
    async handleRedemption(channelName, event, chatClient) {
        try {
            console.log(`[${this.getTimestamp()}] info: Redemption detected in ${channelName}:`, {
                rewardTitle: event.rewardTitle,
                redeemer: event.userName,
                userInput: event.userInput,
                rewardId: event.rewardId
            });

            // Check if this is a timeout redemption
            if (this.isTimeoutRedemption(event.rewardTitle)) {
                await this.handleTimeoutRedemption(channelName, event, chatClient);
            } else {
                console.log(`[${this.getTimestamp()}] info: Redemption "${event.rewardTitle}" not configured for timeout`);
            }

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to handle redemption for ${channelName}:`, error.message);
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

    // Handle timeout redemptions
    async handleTimeoutRedemption(channelName, event, chatClient) {
        try {
            let targetUsername = '';
            let duration = 60; // Default duration

            // Parse user input for target username
            if (event.userInput) {
                const input = event.userInput.trim();

                // Try to extract username and duration
                // Formats: "username", "@username", "username 120", "@username 30"
                const parts = input.split(' ');
                if (parts.length > 0) {
                    targetUsername = parts[0].replace('@', '');
                }
                if (parts.length > 1) {
                    const parsedDuration = parseInt(parts[1]);
                    if (parsedDuration > 0) {
                        duration = parsedDuration;
                    }
                }
            }

            // Validate target username
            if (!targetUsername) {
                if (chatClient) {
                    await chatClient.say(`#${channelName}`,
                        `@${event.userName} please specify a username to timeout! Format: username or @username`
                    );
                }
                return;
            }

            // Prevent self-timeout
            if (targetUsername.toLowerCase() === event.userName.toLowerCase()) {
                if (chatClient) {
                    await chatClient.say(`#${channelName}`,
                        `@${event.userName} you cannot timeout yourself! 😅`
                    );
                }
                return;
            }

            // Prevent targeting the broadcaster
            if (targetUsername.toLowerCase() === channelName.toLowerCase()) {
                if (chatClient) {
                    await chatClient.say(`#${channelName}`,
                        `@${event.userName} you cannot timeout the broadcaster! 😤`
                    );
                }
                return;
            }

            // Send redemption timeout message to bot
            const redemptionMessage = `REDEMPTION_TIMEOUT:${targetUsername}:${event.userName}:${duration}`;

            console.log(`[${this.getTimestamp()}] info: Sending redemption timeout: ${redemptionMessage}`);

            // If chatClient is available, send the message directly to the moderation handler
            if (chatClient) {
                // Simulate a message to trigger the moderation handler
                const mockMessage = {
                    userInfo: {
                        displayName: 'EventSub',
                        isBroadcaster: true,
                        isMod: true,
                        isVip: false
                    }
                };

                // Call moderation handler directly
                const { moderation } = require('./bot-commands/moderation.js');
                moderation(chatClient, redemptionMessage, `#${channelName}`, {
                    username: 'eventsub',
                    'display-name': 'EventSub',
                    badges: { broadcaster: '1' }
                });
            }

        } catch (error) {
            console.log(`[${this.getTimestamp()}] error: Failed to handle timeout redemption:`, error.message);
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

module.exports = { RedemptionEventSubManager };