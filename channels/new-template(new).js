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
  const axios = require('axios');


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

  // Get token directly from .env file only
  console.log(`[${getTimestamp()}] info: Using .env token for static auth`);
  const botOAuthToken = process.env.TWITCH_OAUTH.replace('oauth:', '');

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


  // Connect to chat
  console.log(`[${getTimestamp()}] info: Connecting to Twitch chat...`);
  await chatClient.connect();
  await chatClient.join(channelName);
  console.log(`[${getTimestamp()}] info: Joined #${channelName}`);

  // Channel point redemptions handled by separate EventSub service
  if (channelConfig.redemptionEnabled) {
    console.log(`[${getTimestamp()}] info: ✅ Channel point redemptions enabled - managed by EventSub service`);
  } else {
    console.log(`[${getTimestamp()}] info: Channel point redemptions disabled for ${channelName}`);
  }


  // Sleep/delay function
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper function to trigger EventSub reconnection
  async function triggerEventSubReconnection() {
    try {
      console.log(`[${getTimestamp()}] info: Triggering EventSub reconnection for ${channelName}...`);
      const response = await axios.post('http://localhost:3003/reconnect', {
        channels: [channelName]
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200) {
        console.log(`[${getTimestamp()}] info: ✅ EventSub reconnection triggered successfully for ${channelName}`);
      }
    } catch (error) {
      console.log(`[${getTimestamp()}] warning: Failed to trigger EventSub reconnection: ${error.message}`);
    }
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
        // Trigger EventSub reconnection to activate redemption monitoring
        await triggerEventSubReconnection();
        return { success: true, message: "Channel point redemptions enabled! Managed by EventSub service. Make sure you have a timeout reward set up." };
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    async disableRedemption() {
      channelConfig.redemptionEnabled = false;
      channelConfig.redemptionRewardId = null;
      channelConfig.redemptionTimeoutDuration = 60;

      if (saveChannelConfig(channelName, channelConfig)) {
        // Trigger EventSub reconnection to stop redemption monitoring
        await triggerEventSubReconnection();
        return { success: true, message: "Redemption disabled! EventSub service will stop monitoring this channel." };
      } else {
        return { success: false, message: "Failed to save configuration" };
      }
    },

    getStatus() {
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

  // Load all bot commands at startup (prevents memory leak)
  const commands = {};
  const glob = require("glob");
  console.log(`[${getTimestamp()}] info: Loading bot commands at startup...`);

  function loadBotCommands() {
    const excludedCommands = channelConfig.excludedCommands || [];
    const loadedCommands = {};

    glob.sync(`${process.env.BOT_FULL_PATH}/bot-commands/*.js`).forEach(file => {
      try {
        const functionName = file.split('/').pop().replace('.js', '');

        // Skip if command is in the excluded list
        if (excludedCommands.includes(functionName)) {
          console.log(`[${getTimestamp()}] info: Skipping excluded command: ${functionName}`);
          return;
        }

        const commandExports = require(file);
        if (typeof commandExports[functionName] === 'function') {
          loadedCommands[functionName] = commandExports[functionName];
          console.log(`[${getTimestamp()}] info: Loaded command: ${functionName}`);
        }
      } catch (error) {
        console.log(`[${getTimestamp()}] warning: Failed to load command from ${file}: ${error.message}`);
      }
    });

    return loadedCommands;
  }

  // Load commands once at startup
  Object.assign(commands, loadBotCommands());

  // Function to reload commands (used when excluded commands change)
  function reloadCommands() {
    // Clear existing commands
    Object.keys(commands).forEach(key => delete commands[key]);
    // Reload with current configuration
    Object.assign(commands, loadBotCommands());
    console.log(`[${getTimestamp()}] info: Commands reloaded due to configuration change`);
  }

  // Function to reload channel config from disk (live reload)
  function reloadChannelConfig() {
    try {
      const newConfig = loadChannelConfig(channelName);
      // Update all config properties
      Object.keys(newConfig).forEach(key => {
        channelConfig[key] = newConfig[key];
      });
      console.log(`[${getTimestamp()}] info: Channel config reloaded from disk`);
      return true;
    } catch (error) {
      console.log(`[${getTimestamp()}] error: Failed to reload channel config: ${error.message}`);
      return false;
    }
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
            `Excluded Commands: ${status.excludedCommands.length}`
          );
          break;

        case 'enable':
          const enableResult = await configCommands.enableModeration();
          await chatClient.say(channel, `${enableResult.message} Restarting bot...`);
          if (enableResult.success) {
            console.log(`[${getTimestamp()}] info: Moderation enabled - restarting bot via process.exit(0)`);
            setTimeout(() => process.exit(0), 1000); // PM2 will restart automatically
          }
          break;

        case 'disable':
          const disableResult = await configCommands.disableModeration();
          await chatClient.say(channel, `${disableResult.message} Restarting bot...`);
          if (disableResult.success) {
            console.log(`[${getTimestamp()}] info: Moderation disabled - restarting bot via process.exit(0)`);
            setTimeout(() => process.exit(0), 1000); // PM2 will restart automatically
          }
          break;

        case 'redemption':
          const subCommand = args[2]?.toLowerCase();
          if (subCommand === 'enable') {
            const redemptionEnableResult = await configCommands.enableRedemption();
            await chatClient.say(channel, `${redemptionEnableResult.message} Restarting bot...`);
            if (redemptionEnableResult.success) {
              console.log(`[${getTimestamp()}] info: Redemption enabled - restarting bot via process.exit(0)`);
              setTimeout(() => process.exit(0), 1000); // PM2 will restart automatically
            }
          } else if (subCommand === 'disable') {
            const redemptionDisableResult = await configCommands.disableRedemption();
            await chatClient.say(channel, `${redemptionDisableResult.message} Restarting bot...`);
            if (redemptionDisableResult.success) {
              console.log(`[${getTimestamp()}] info: Redemption disabled - restarting bot via process.exit(0)`);
              setTimeout(() => process.exit(0), 1000); // PM2 will restart automatically
            }
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
          await chatClient.say(channel,
            `Redemption Status: ${channelConfig.redemptionEnabled ? 'Enabled' : 'Disabled'} | ` +
            `Managed by EventSub service | ` +
            `Check service logs for EventSub status`
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
                reloadChannelConfig(); // Live reload the config
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
                reloadChannelConfig(); // Live reload the config
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
                reloadCommands(); // Reload commands to apply exclusion
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
                reloadCommands(); // Reload commands to apply re-enablement
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
              reloadChannelConfig(); // Live reload the config
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
              reloadChannelConfig(); // Live reload the config
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

      // Get excluded commands from channel config
      const excludedCommands = channelConfig.excludedCommands || [];

      // For command messages, check if the requested command is excluded FIRST
      if (isCommand && excludedCommands.includes(requestedCommandName)) {
        console.log(`[${getTimestamp()}] info: Command "${requestedCommandName}" is excluded for channel ${channelName} - blocking execution`);
        return; // Stop processing this command entirely
      }

      // Execute ALL command functions for ALL messages (they handle their own filtering)
      // Commands are now loaded once at startup instead of per-message
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

  // Memory cleanup function
  function performMemoryCleanup() {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log(`[${getTimestamp()}] info: Manual garbage collection triggered`);
      }

      // Log memory usage
      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };

      console.log(`[${getTimestamp()}] info: Memory usage - RSS: ${memUsageMB.rss}MB, Heap Used: ${memUsageMB.heapUsed}MB, Heap Total: ${memUsageMB.heapTotal}MB, External: ${memUsageMB.external}MB`);

      // Clear require cache for bot-commands (but keep core modules)
      Object.keys(require.cache).forEach(key => {
        if (key.includes('/bot-commands/') && !key.includes('node_modules')) {
          delete require.cache[key];
        }
      });

    } catch (error) {
      console.log(`[${getTimestamp()}] warning: Memory cleanup error: ${error.message}`);
    }
  }

  // Set up periodic memory cleanup (every 15 minutes)
  const memoryCleanupInterval = setInterval(performMemoryCleanup, 15 * 60 * 1000);

  // Handle disconnection gracefully
  process.on('SIGINT', async () => {
    console.log(`[${getTimestamp()}] info: Received SIGINT, shutting down gracefully...`);

    // Clear intervals
    if (memoryCleanupInterval) {
      clearInterval(memoryCleanupInterval);
    }

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