async function main() {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

  const fs = require('fs');
  const channelName = "$$UPDATEHERE$$";

  function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  console.log(`[${getTimestamp()}] Starting Mr-AI-is-Here bot for channel: ${channelName}`);

  const { ChatClient } = require('@twurple/chat');
  const { ApiClient } = require('@twurple/api');
  const { StaticAuthProvider } = require('@twurple/auth');

  // Import the EventSub manager
  const { CustomRewardsEventSubManager } = require(`${process.env.BOT_FULL_PATH}/custom-rewards-eventsub.js`);

  // SECURITY: Validate channel name to prevent path traversal
  function validateChannelName(channelName) {
    if (!channelName || typeof channelName !== 'string') {
      return false;
    }
    
    // Block path traversal attempts
    if (channelName.includes('..') || channelName.includes('/') || channelName.includes('\\') || channelName.includes('\0')) {
      return false;
    }
    
    // Twitch username validation: 4-25 chars, alphanumeric + underscore only
    const twitchUsernameRegex = /^[a-zA-Z0-9_]{4,25}$/;
    return twitchUsernameRegex.test(channelName);
  }

  // Load channel configuration
  function loadChannelConfig(channelName) {
    // SECURITY: Validate channel name before path construction
    if (!validateChannelName(channelName)) {
      console.log(`[${getTimestamp()}] error: Invalid channel name: ${channelName}`);
      return defaultConfig;
    }
    
    const configPath = `${process.env.BOT_FULL_PATH}/channel-configs/${channelName}.json`;
    const defaultConfig = {
      channelName: channelName,
      chatOnly: false, // Default to full features
      moderationEnabled: true, // Default enabled (requires bot to be mod)
      clientId: process.env.TWITCH_CLIENTID,
      moderatorUsername: process.env.TWITCH_USERNAME, // Bot is the moderator
      lastUpdated: null,
      redemptionEnabled: false, // Disabled by default (requires broadcaster OAuth)
      redemptionRewardId: null,
      redemptionTimeoutDuration: 60,
      specialUsers: [], // Default to empty array
      excludedCommands: [] // NEW: Commands to exclude/disable for this channel
    };

    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`[${getTimestamp()}] info: Loaded config for ${channelName}`);
        return { ...defaultConfig, ...config };
      } else {
        console.log(`[${getTimestamp()}] info: No config found for ${channelName}, using defaults`);
        return defaultConfig;
      }
    } catch (error) {
      console.log(`[${getTimestamp()}] error: Failed to load config for ${channelName}:`, error.message);
      return defaultConfig;
    }
  }

  // Save channel configuration
  function saveChannelConfig(channelName, config) {
    // SECURITY: Validate channel name before path construction
    if (!validateChannelName(channelName)) {
      console.log(`[${getTimestamp()}] error: Invalid channel name for save: ${channelName}`);
      return false;
    }
    
    const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;
    const configPath = `${configDir}/${channelName}.json`;

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`[${getTimestamp()}] info: Saved config for ${channelName}`);
      return true;
    } catch (error) {
      console.log(`[${getTimestamp()}] error: Failed to save config for ${channelName}:`, error.message);
      return false;
    }
  }

  // Load configuration for this channel
  const channelConfig = loadChannelConfig(channelName);

  // Function to get current token (from shared file or .env fallback)
  function getCurrentToken() {
    try {
      // Try to read from shared token file first
      const sharedTokenPath = `${process.env.BOT_FULL_PATH}/shared-tokens.json`;
      if (fs.existsSync(sharedTokenPath)) {
        const sharedTokenData = JSON.parse(fs.readFileSync(sharedTokenPath, 'utf8'));
        console.log(`[${getTimestamp()}] info: Using shared token (updated: ${sharedTokenData.updatedAt})`);
        return sharedTokenData.accessToken;
      }
    } catch (error) {
      console.log(`[${getTimestamp()}] warning: Could not read shared token file, falling back to .env: ${error.message}`);
    }
    
    // Fallback to .env file
    console.log(`[${getTimestamp()}] info: Using .env token as fallback`);
    return process.env.TWITCH_OAUTH.replace('oauth:', '');
  }

  // Get current token from shared system
  const botOAuthToken = getCurrentToken();

  // Create auth provider using current token
  const botAuthProvider = new StaticAuthProvider(
    process.env.TWITCH_CLIENTID,
    botOAuthToken,
    ['chat:read', 'chat:edit', 'channel:read:subscriptions', 'moderator:manage:banned_users']
  );

  // Log bot's moderation setup
  console.log(`[${getTimestamp()}] info: Bot OAuth configured for ${channelName}`);
  if (channelConfig.moderationEnabled) {
    console.log(`[${getTimestamp()}] info: Moderation enabled - Bot will act as moderator (ensure bot has mod status)`);
  } else {
    console.log(`[${getTimestamp()}] info: Chat-only mode for ${channelName}`);
  }

  // Create chat client and API client using bot's OAuth
  const chatClient = new ChatClient({ authProvider: botAuthProvider });
  const apiClient = new ApiClient({ authProvider: botAuthProvider });

  // Create EventSub manager instance
  const redemptionManager = new CustomRewardsEventSubManager();

  // Connect to chat
  console.log(`[${getTimestamp()}] info: Connecting to Twitch chat...`);
  await chatClient.connect();
  await chatClient.join(channelName);
  console.log(`[${getTimestamp()}] info: Joined #${channelName}`);

  // Initialize EventSub for redemptions if enabled
  if (channelConfig.redemptionEnabled) {
    console.log(`[${getTimestamp()}] info: Initializing channel point redemption EventSub...`);
    redemptionManager.initializeChannelEventSub(channelName, chatClient)
      .then(success => {
        if (success) {
          console.log(`[${getTimestamp()}] info: ✅ EventSub active for channel point redemptions`);
        } else {
          console.log(`[${getTimestamp()}] warning: ❌ EventSub failed to initialize for redemptions`);
        }
      })
      .catch(error => {
        console.log(`[${getTimestamp()}] error: EventSub initialization failed:`, error.message);
      });
  } else {
    console.log(`[${getTimestamp()}] info: Channel point redemptions disabled for ${channelName}`);
  }

  // Smart token expiry-based EventSub reconnection
  let tokenExpiryTimeout = null;

  async function scheduleEventSubReconnection() {
    try {
      if (!channelConfig.redemptionEnabled) return;
      
      // Get current broadcaster token with expiry info
      const response = await fetch(`http://localhost:3001/auth/token?channel=${channelName}`);
      if (!response.ok) return;
      
      const tokenData = await response.json();
      const expiresInSeconds = tokenData.expires_in || 14400; // Default 4 hours
      
      // Clear any existing timeout
      if (tokenExpiryTimeout) {
        clearTimeout(tokenExpiryTimeout);
      }
      
      // Calculate when oauth-service.js will refresh (1 hour before expiry)
      const refreshWillHappenIn = (expiresInSeconds - 3600) * 1000; // Convert to milliseconds
      
      // Schedule reconnection 30 seconds after the refresh should happen
      const reconnectIn = refreshWillHappenIn + (30 * 1000);
      
      console.log(`[${getTimestamp()}] info: 📅 Token expires in ${Math.floor(expiresInSeconds/3600)}h ${Math.floor((expiresInSeconds%3600)/60)}m`);
      console.log(`[${getTimestamp()}] info: 🔄 EventSub reconnection scheduled in ${Math.floor(reconnectIn/1000/60)} minutes`);
      
      tokenExpiryTimeout = setTimeout(async () => {
        console.log(`[${getTimestamp()}] info: ⏰ Scheduled EventSub reconnection triggered`);
        
        // Wait a bit more to ensure oauth-service.js has refreshed
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second buffer
        
        // Stop current EventSub
        await redemptionManager.stopChannelEventSub(channelName);
        
        // Reconnect with new token
        const success = await redemptionManager.initializeChannelEventSub(channelName, chatClient);
        
        if (success) {
          console.log(`[${getTimestamp()}] info: ✅ EventSub reconnected with refreshed token`);
          // Schedule next reconnection
          setTimeout(() => scheduleEventSubReconnection(), 60000); // Re-schedule in 1 minute
        } else {
          console.log(`[${getTimestamp()}] error: ❌ EventSub reconnection failed, will retry in 5 minutes`);
          setTimeout(() => scheduleEventSubReconnection(), 5 * 60 * 1000);
        }
        
      }, Math.max(reconnectIn, 60000)); // Minimum 1 minute delay
      
    } catch (error) {
      console.log(`[${getTimestamp()}] error: Failed to schedule EventSub reconnection:`, error.message);
      // Fallback: try again in 10 minutes
      setTimeout(() => scheduleEventSubReconnection(), 10 * 60 * 1000);
    }
  }

  // Initialize smart reconnection scheduling
  setTimeout(scheduleEventSubReconnection, 30 * 1000); // Start after 30 seconds

  // Sleep/delay function
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get game information using API
  async function getGame(loginName) {
    try {
      console.log(`[${getTimestamp()}] info: Getting game info for: ${loginName}`);
      const user = await apiClient.users.getUserByName(loginName);
      if (!user) return "No game detected";

      const channelInfo = await apiClient.channels.getChannelInfoById(user.id);
      const gameName = channelInfo?.gameName || "No game detected";
      console.log(`[${getTimestamp()}] info: Game for ${loginName}: ${gameName}`);
      return gameName;
    } catch (error) {
      console.log(`[${getTimestamp()}] info: Error getting game info:`, error.message);
      return "No game detected";
    }
  }

  // Configuration management commands - UPDATED
  const configCommands = {
    async enableModeration() {
      channelConfig.moderationEnabled = true;
      channelConfig.moderatorUsername = process.env.TWITCH_USERNAME; // Bot is moderator
      channelConfig.chatOnly = false;

      if (saveChannelConfig(channelName, channelConfig)) {
        return { success: true, message: `Moderation enabled! Bot (${process.env.TWITCH_USERNAME}) will act as moderator. Ensure bot has mod status. Restart to apply changes.` };
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    async disableModeration() {
      channelConfig.moderationEnabled = false;
      channelConfig.chatOnly = true;

      if (saveChannelConfig(channelName, channelConfig)) {
        return { success: true, message: "Moderation disabled! Restart bot to apply changes." };
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    async enableRedemption() {
      channelConfig.redemptionEnabled = true;

      if (saveChannelConfig(channelName, channelConfig)) {
        // Try to initialize EventSub immediately
        const success = await redemptionManager.initializeChannelEventSub(channelName, chatClient);
        if (success) {
          return { success: true, message: "Channel point redemptions enabled! EventSub is now active. Make sure you have a timeout reward set up." };
        } else {
          return { success: false, message: "Redemptions enabled in config but EventSub failed to start. Check OAuth token at https://mr-ai.dev/auth" };
        }
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    async disableRedemption() {
      channelConfig.redemptionEnabled = false;
      channelConfig.redemptionRewardId = null;
      channelConfig.redemptionTimeoutDuration = 60;

      // Stop EventSub for this channel
      await redemptionManager.stopChannelEventSub(channelName);

      if (saveChannelConfig(channelName, channelConfig)) {
        return { success: true, message: "Redemption disabled! EventSub stopped." };
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    getStatus() {
      const eventSubStatus = redemptionManager.getStatus();
      return {
        channel: channelName,
        moderationEnabled: channelConfig.moderationEnabled,
        chatOnly: channelConfig.chatOnly,
        moderatorUsername: channelConfig.moderatorUsername,
        botOAuth: !!process.env.TWITCH_OAUTH,
        lastUpdated: channelConfig.lastUpdated,
        redemptionEnabled: channelConfig.redemptionEnabled,
        redemptionRewardId: channelConfig.redemptionRewardId,
        redemptionTimeoutDuration: channelConfig.redemptionTimeoutDuration,
        eventSubActive: eventSubStatus.activeChannels.includes(channelName),
        excludedCommands: channelConfig.excludedCommands || []
      };
    }
  };

  // Load matchmaking file if it exists
  try {
    const { readMatchmakingFile } = require(`${process.env.BOT_FULL_PATH}/bot-commands/partyMatchmaking.js`);
    readMatchmakingFile();
    console.log(`[${getTimestamp()}] info: Loaded partyMatchmaking.js`);
  } catch (error) {
    console.log(`[${getTimestamp()}] info: partyMatchmaking.js not found, skipping`);
  }

  // Handle raid events
  chatClient.onRaid(async (channel, user, raidInfo) => {
    const viewers = raidInfo.viewerCount;
    // Fix: Use the correct property for username
    const username = user.displayName || user.name || user;

    console.log(`[${getTimestamp()}] info: RAID event: ${username} raided with ${viewers} viewers`);
    console.log(`[${getTimestamp()}] debug: User object:`, user); // Debug log to see user structure

    if (viewers >= 2) {
      try {
        // Use displayName for the API call if available, otherwise fallback to name
        const loginName = user.name || user.displayName || user;
        const gameInfo = await getGame(loginName.toLowerCase()); // Ensure lowercase for API call
        const raidMessage = `Thank you @${username} for the raid of ${viewers}! They were last seen streaming [${gameInfo}]. Check them out @ https://www.twitch.tv/${loginName.toLowerCase()}`;

        await chatClient.say(channel, raidMessage);
        console.log(`[${getTimestamp()}] info: RAID response sent to #${channel}`);
      } catch (error) {
        console.log(`[${getTimestamp()}] error: RAID response failed:`, error.message);
      }
    } else {
      console.log(`[${getTimestamp()}] info: RAID ignored (less than 2 viewers)`);
    }
  });

  // Handle chat messages
  chatClient.onMessage(async (channel, user, text, msg) => {
    // Log every message
    console.log(`[${getTimestamp()}] info: [#${channel}] <${msg.userInfo.displayName || user}>: ${text}`);

    // Don't respond to bot's own messages
    if (user === process.env.TWITCH_USERNAME.toLowerCase()) {
      console.log(`[${getTimestamp()}] info: Ignoring own message`);
      return;
    }

    // Set variables for user permission logic
    const isBroadcaster = msg.userInfo.isBroadcaster;
    const isMod = msg.userInfo.isMod;
    const isVip = msg.userInfo.isVip;
    const isOwner = user === process.env.TWITCH_OWNER.toLowerCase();

    // Special user logic from channel config
    const specialUsers = channelConfig.specialUsers || [];
    const isSpecialUser = specialUsers.includes(user);

    const isModUp = isBroadcaster || isMod || isOwner;
    const isVIPUp = isVip || isModUp;

    // Log user permissions
    const permissions = [];
    if (isBroadcaster) permissions.push('broadcaster');
    if (isMod) permissions.push('moderator');
    if (isVip) permissions.push('vip');
    if (isSpecialUser) permissions.push('special');
    if (permissions.length > 0) {
      console.log(`[${getTimestamp()}] info: User ${user} has permissions: ${permissions.join(', ')}`);
    }

    // Configuration commands (broadcaster/owner only) - UPDATED WITH EXCLUDE COMMANDS
    if ((isBroadcaster || isOwner) && text.startsWith('!config')) {
      const args = text.split(' ');
      const command = args[1]?.toLowerCase();

      switch (command) {
        case 'status':
          const status = configCommands.getStatus();
          await chatClient.say(channel,
            `Mr-AI-is-Here Config - Moderation: ${status.moderationEnabled ? 'Enabled' : 'Disabled'} | ` +
            `Mode: ${status.chatOnly ? 'Chat Only' : 'Full Features'} | ` +
            `Bot OAuth: ${status.botOAuth ? 'Active' : 'Missing'} | ` +
            `Redemptions: ${status.redemptionEnabled ? 'Enabled' : 'Disabled'} | ` +
            `EventSub: ${status.eventSubActive ? 'Active' : 'Inactive'} | ` +
            `Excluded Commands: ${status.excludedCommands.length}`
          );
          break;

        case 'enable':
          const enableResult = await configCommands.enableModeration();
          await chatClient.say(channel, enableResult.message);
          break;

        case 'disable':
          const disableResult = await configCommands.disableModeration();
          await chatClient.say(channel, disableResult.message);
          break;

        case 'redemption':
          const subCommand = args[2]?.toLowerCase();
          if (subCommand === 'enable') {
            const redemptionEnableResult = await configCommands.enableRedemption();
            await chatClient.say(channel, redemptionEnableResult.message);
          } else if (subCommand === 'disable') {
            const redemptionDisableResult = await configCommands.disableRedemption();
            await chatClient.say(channel, redemptionDisableResult.message);
          } else if (subCommand === 'duration') {
            const newDuration = parseInt(args[3]);
            if (newDuration && newDuration > 0 && newDuration <= 1209600) { // Max 14 days
              channelConfig.redemptionTimeoutDuration = newDuration;
              if (saveChannelConfig(channelName, channelConfig)) {
                await chatClient.say(channel, `Redemption timeout duration set to ${newDuration} seconds.`);
              } else {
                await chatClient.say(channel, "Failed to save timeout duration.");
              }
            } else {
              await chatClient.say(channel, `Current timeout duration: ${channelConfig.redemptionTimeoutDuration} seconds. Usage: !config redemption duration <seconds>`);
            }
          } else {
            await chatClient.say(channel, "Usage: !config redemption enable/disable/duration <seconds> | Setup OAuth at https://mr-ai.dev/auth");
          }
          break;

        case 'redemption-status':
          const eventSubStatus = redemptionManager.getStatus();
          await chatClient.say(channel,
            `EventSub Status - Active Channels: ${eventSubStatus.activeChannels.length} | ` +
            `Listeners: ${eventSubStatus.listenerCount} | ` +
            `This Channel: ${eventSubStatus.activeChannels.includes(channelName) ? 'Active' : 'Inactive'}`
          );
          break;

        case 'modstatus':
          if (channelConfig.moderationEnabled) {
            await chatClient.say(channel, `Bot moderation enabled. Ensure ${process.env.TWITCH_USERNAME} has moderator status in this channel (/mod ${process.env.TWITCH_USERNAME})`);
          } else {
            await chatClient.say(channel, "Bot moderation disabled. Use !config enable to activate.");
          }
          break;

        case 'special':
          const specialAction = args[2]?.toLowerCase();
          const rawTargetUser = args[3];

          if (specialAction === 'add' && rawTargetUser) {
            // SECURITY: Validate username before adding to special users
            const targetUser = rawTargetUser.toLowerCase();
            if (!validateChannelName(targetUser)) {
              await chatClient.say(channel, `Invalid username format: ${rawTargetUser}. Use only letters, numbers, and underscores.`);
              break;
            }
            
            if (!channelConfig.specialUsers.includes(targetUser)) {
              channelConfig.specialUsers.push(targetUser);
              if (saveChannelConfig(channelName, channelConfig)) {
                await chatClient.say(channel, `Added ${targetUser} as a special user.`);
              } else {
                await chatClient.say(channel, "Failed to save special user.");
              }
            } else {
              await chatClient.say(channel, `${targetUser} is already a special user.`);
            }
          } else if (specialAction === 'remove' && rawTargetUser) {
            // SECURITY: Validate username before removing from special users
            const targetUser = rawTargetUser.toLowerCase();
            if (!validateChannelName(targetUser)) {
              await chatClient.say(channel, `Invalid username format: ${rawTargetUser}. Use only letters, numbers, and underscores.`);
              break;
            }
            
            const index = channelConfig.specialUsers.indexOf(targetUser);
            if (index > -1) {
              channelConfig.specialUsers.splice(index, 1);
              if (saveChannelConfig(channelName, channelConfig)) {
                await chatClient.say(channel, `Removed ${targetUser} from special users.`);
              } else {
                await chatClient.say(channel, "Failed to remove special user.");
              }
            } else {
              await chatClient.say(channel, `${targetUser} is not a special user.`);
            }
          } else if (specialAction === 'list') {
            const specialList = channelConfig.specialUsers.length > 0
              ? channelConfig.specialUsers.join(', ')
              : 'None';
            await chatClient.say(channel, `Special users: ${specialList}`);
          } else {
            await chatClient.say(channel, "Usage: !config special add/remove/list [username]");
          }
          break;

        // NEW: Exclude commands management
        case 'exclude':
          const excludeAction = args[2]?.toLowerCase();
          const rawCommandName = args[3];

          if (excludeAction === 'add' && rawCommandName) {
            // SECURITY: Validate command name to prevent injection
            const commandName = rawCommandName.toLowerCase();
            if (!/^[a-zA-Z0-9_-]{1,30}$/.test(commandName)) {
              await chatClient.say(channel, `Invalid command name: ${rawCommandName}. Use only letters, numbers, underscores, and hyphens.`);
              break;
            }
            
            if (!channelConfig.excludedCommands.includes(commandName)) {
              channelConfig.excludedCommands.push(commandName);
              if (saveChannelConfig(channelName, channelConfig)) {
                await chatClient.say(channel, `Command "${commandName}" has been disabled for this channel.`);
              } else {
                await chatClient.say(channel, "Failed to save excluded command.");
              }
            } else {
              await chatClient.say(channel, `Command "${commandName}" is already disabled.`);
            }
          } else if (excludeAction === 'remove' && rawCommandName) {
            // SECURITY: Validate command name to prevent injection
            const commandName = rawCommandName.toLowerCase();
            if (!/^[a-zA-Z0-9_-]{1,30}$/.test(commandName)) {
              await chatClient.say(channel, `Invalid command name: ${rawCommandName}. Use only letters, numbers, underscores, and hyphens.`);
              break;
            }
            
            const index = channelConfig.excludedCommands.indexOf(commandName);
            if (index > -1) {
              channelConfig.excludedCommands.splice(index, 1);
              if (saveChannelConfig(channelName, channelConfig)) {
                await chatClient.say(channel, `Command "${commandName}" has been re-enabled for this channel.`);
              } else {
                await chatClient.say(channel, "Failed to remove excluded command.");
              }
            } else {
              await chatClient.say(channel, `Command "${commandName}" is not currently disabled.`);
            }
          } else if (excludeAction === 'list') {
            const excludedList = channelConfig.excludedCommands.length > 0
              ? channelConfig.excludedCommands.join(', ')
              : 'None';
            await chatClient.say(channel, `Disabled commands: ${excludedList}`);
          } else {
            await chatClient.say(channel, "Usage: !config exclude add/remove/list [commandname]");
          }
          break;

        // Location configuration for forex and timezone commands
        case 'location':
          const locationAction = args[2]?.toLowerCase();
          
          if (locationAction === 'set') {
            const rawLocation = args.slice(3).join(' '); // Allow multi-word countries like "united states"
            
            if (!rawLocation) {
              await chatClient.say(channel, "Usage: !config location set [country name] (e.g., !config location set united states)");
              break;
            }
            
            // Validate location input
            const location = rawLocation.toLowerCase().trim();
            if (!/^[a-zA-Z\s\-']{2,50}$/.test(location)) {
              await chatClient.say(channel, "Invalid location. Use only letters, spaces, and hyphens (e.g., 'united states', 'south korea').");
              break;
            }
            
            channelConfig['irl-location'] = location;
            if (saveChannelConfig(channelName, channelConfig)) {
              await chatClient.say(channel, `Location set to: ${location}. This will be used for forex auto-conversion and timezone detection.`);
            } else {
              await chatClient.say(channel, "Failed to save location setting.");
            }
          } else if (locationAction === 'get' || !locationAction) {
            const currentLocation = channelConfig['irl-location'] || 'Not set';
            await chatClient.say(channel, `Current location: ${currentLocation}`);
          } else if (locationAction === 'clear') {
            delete channelConfig['irl-location'];
            if (saveChannelConfig(channelName, channelConfig)) {
              await chatClient.say(channel, "Location cleared.");
            } else {
              await chatClient.say(channel, "Failed to clear location.");
            }
          } else {
            await chatClient.say(channel, "Usage: !config location set/get/clear [country name]");
          }
          break;

        default:
          await chatClient.say(channel, "Config commands: !config status | !config enable | !config disable | !config redemption enable/disable | !config redemption-status | !config modstatus | !config special add/remove/list [username] | !config exclude add/remove/list [commandname] | !config location set/get/clear [country]");
      }
      return;
    }

    // Check if moderation commands are being used without proper config
    if (isModUp && !channelConfig.moderationEnabled &&
      ['!timeout', '!ban', '!unban'].includes(text.split(' ')[0].toLowerCase())) {
      await chatClient.say(channel, `Moderation not enabled. Use !config enable to activate bot moderation.`);
      return;
    }

    // Check if bot has OAuth token for moderation
    if (isModUp && channelConfig.moderationEnabled && !process.env.TWITCH_OAUTH &&
      ['!timeout', '!ban', '!unban'].includes(text.split(' ')[0].toLowerCase())) {
      await chatClient.say(channel, "Bot OAuth token missing. Check bot configuration.");
      return;
    }

    // FIXED: Bot Commands (command system with proper excluded command logging)
    try {
      // First, check if the message is even a command before processing
      const messageWords = text.split(' ');
      const potentialCommand = messageWords[0].toLowerCase();
      let isCommand = false;
      let requestedCommandName = '';

      // Check if message starts with a command trigger
      if (potentialCommand.startsWith('!')) {
        requestedCommandName = potentialCommand.substring(1); // Remove the !
        isCommand = true;
      }

      // Load and execute commands for ALL messages (not just commands starting with !)
      const commands = {};
      const glob = require("glob");
      // Get excluded commands from channel config
      const excludedCommands = channelConfig.excludedCommands || [];

      // For command messages, check if the requested command is excluded FIRST
      if (isCommand && excludedCommands.includes(requestedCommandName)) {
        console.log(`[${getTimestamp()}] info: Command "${requestedCommandName}" is excluded for channel ${channelName} - blocking execution`);
        return; // Stop processing this command entirely
      }

      // Load all available commands (excluding the excluded ones)
      glob.sync(`${process.env.BOT_FULL_PATH}/bot-commands/*.js`).forEach(file => {
        const commandExports = require(file);
        const functionName = file.split('/').pop().replace('.js', '');

        // Skip if command is in the excluded list
        if (excludedCommands.includes(functionName)) {
          return;
        }

        if (typeof commandExports[functionName] === 'function') {
          commands[functionName] = commandExports[functionName];
        }
      });

      // Execute ALL command functions for ALL messages (they handle their own filtering)
      Object.keys(commands).forEach(commandName => {
        const commandFunction = commands[commandName];
        const tmiCompatibleTags = {
          username: user,
          'display-name': msg.userInfo.displayName,
          badges: {
            broadcaster: isBroadcaster ? '1' : undefined,
            moderator: isMod ? '1' : undefined,
            vip: isVip ? '1' : undefined,
            subscriber: msg.userInfo.isSubscriber ? '1' : undefined,    // Map from Twurple
            founder: msg.userInfo.isFounder ? '1' : undefined           // Map from Twurple
          },
          isModUp: isModUp,
          isVIPUp: isVIPUp,
          isSpecialUser: isSpecialUser,
          ...msg.userInfo
        };

        const clientWrapper = {
          say: (channel, message) => {
            console.log(`[${getTimestamp()}] info: Command response: ${message}`);
            return chatClient.say(channel, message);
          }
        };

        try {
          commandFunction(clientWrapper, text, channel, tmiCompatibleTags);
        } catch (error) {
          // Only log actual errors, not "not our command" type messages
          if (error.message && !error.message.includes('Not our command')) {
            console.log(`[${getTimestamp()}] error: Command ${commandName} failed:`, error.message);
          }
        }
      });
      // If not a command, skip all command processing entirely

    } catch (error) {
      console.log(`[${getTimestamp()}] error: Command processing failed:`, error.message);
    }

    // Handle bot's own channel commands
    if (channel.includes(process.env.TWITCH_USERNAME)) {
      console.log(`[${getTimestamp()}] info: Message in bot's own channel detected`);
      switch (text.toLowerCase()) {
        default:
        // Handle other message processing
      }
    }
  });

  // Connection event handlers
  chatClient.onConnect(() => {
    console.log(`[${getTimestamp()}] info: Successfully connected to Twitch chat`);
  });

  chatClient.onDisconnect((manually, reason) => {
    if (manually) {
      console.log(`[${getTimestamp()}] info: Manually disconnected from chat`);
    } else {
      console.log(`[${getTimestamp()}] info: Disconnected from chat. Reason: ${reason || 'Unknown'}`);
    }
  });

  chatClient.onJoin((channel, user) => {
    console.log(`[${getTimestamp()}] info: User ${user} joined #${channel}`);
  });

  chatClient.onPart((channel, user) => {
    console.log(`[${getTimestamp()}] info: User ${user} left #${channel}`);
  });

  // Log timeouts performed by other moderators
  chatClient.onTimeout((channel, user, duration, reason) => {
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: TIMEOUT - User: ${user} | Channel: ${channel} | Duration: ${duration}s | Reason: ${reason || 'No reason provided'}`);
  });

  // Log bans performed by other moderators
  chatClient.onBan((channel, user, reason) => {
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: BAN - User: ${user} | Channel: ${channel} | Reason: ${reason || 'No reason provided'}`);
  });

  // Log message deletions by moderators
  chatClient.onMessageRemove((channel, messageId, msg) => {
    const username = msg?.userInfo?.displayName || 'Unknown';
    const messageText = msg?.text || 'Unknown message';
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: MESSAGE_DELETED - Channel: ${channel} | User: ${username} | Message: "${messageText}" | Message ID: ${messageId}`);
  });

  // Log when chat is cleared
  chatClient.onChatClear((channel) => {
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: CHAT_CLEARED - Channel: ${channel}`);
  });

  // Log emote-only mode changes
  chatClient.onEmoteOnly((channel, enabled) => {
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: EMOTE_ONLY_MODE - Channel: ${channel} | Status: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  });

  // Log followers-only mode changes
  chatClient.onFollowersOnly((channel, enabled, delay) => {
    if (enabled) {
      console.log(`[${getTimestamp()}] EXTERNAL_MOD: FOLLOWERS_ONLY_MODE - Channel: ${channel} | Status: ENABLED | Minimum follow time: ${delay || 0} minutes`);
    } else {
      console.log(`[${getTimestamp()}] EXTERNAL_MOD: FOLLOWERS_ONLY_MODE - Channel: ${channel} | Status: DISABLED`);
    }
  });

  // Log slow mode changes
  chatClient.onSlow((channel, enabled, delay) => {
    if (enabled) {
      console.log(`[${getTimestamp()}] EXTERNAL_MOD: SLOW_MODE - Channel: ${channel} | Status: ENABLED | Delay: ${delay} seconds between messages`);
    } else {
      console.log(`[${getTimestamp()}] EXTERNAL_MOD: SLOW_MODE - Channel: ${channel} | Status: DISABLED`);
    }
  });

  // Log subscribers-only mode changes
  chatClient.onSubsOnly((channel, enabled) => {
    console.log(`[${getTimestamp()}] EXTERNAL_MOD: SUBSCRIBERS_ONLY_MODE - Channel: ${channel} | Status: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  });

  // Note: onUnique, onHost, and onUnhost may not be available in all @twurple/chat versions
  // Removed these event handlers to prevent errors

  console.log(`[${getTimestamp()}] info: External moderation logging enabled - All external mod actions will be logged to console`);

  // Handle disconnection gracefully
  process.on('SIGINT', async () => {
    console.log(`[${getTimestamp()}] info: Received SIGINT, shutting down gracefully...`);

    // Stop EventSub listeners
    await redemptionManager.stopAll();

    await chatClient.quit();
    console.log(`[${getTimestamp()}] info: Mr-AI-is-Here bot shut down complete`);
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error(`[${getTimestamp()}] error: Uncaught exception:`, error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${getTimestamp()}] error: Unhandled rejection at:`, promise, 'reason:', reason);
  });

  console.log(`[${getTimestamp()}] info: Mr-AI-is-Here bot ready for ${channelName} - Mode: ${channelConfig.chatOnly ? 'Chat Only' : 'Full Features'}`);
  console.log(`[${getTimestamp()}] info: Using bot OAuth token for all operations`);
  console.log(`[${getTimestamp()}] info: Moderation: ${channelConfig.moderationEnabled ? 'Enabled' : 'Disabled'} (Bot acts as moderator)`);
  console.log(`[${getTimestamp()}] info: Redemptions: ${channelConfig.redemptionEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`[${getTimestamp()}] info: Excluded Commands: ${channelConfig.excludedCommands?.length || 0}`);
  console.log(`[${getTimestamp()}] info: Monitoring chat messages...`);
}

main().catch(error => {
  console.error(`[${new Date().toISOString()}] FATAL ERROR:`, error);
  process.exit(1);
});