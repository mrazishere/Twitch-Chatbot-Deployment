async function main() {
  require('dotenv').config();

  const fs = require('fs');
  const channelName = "$$UPDATEHERE$$";

  console.log(`[${getTimestamp()}] Starting Mr-AI-is-Here bot for channel: ${channelName}`);

  const { ChatClient } = require('@twurple/chat');
  const { ApiClient } = require('@twurple/api');
  const { StaticAuthProvider } = require('@twurple/auth');

  // Import the EventSub manager
  const { RedemptionEventSubManager } = require(`${process.env.BOT_FULL_PATH}/eventsub-redemptions.js`);

  function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Load channel configuration
  function loadChannelConfig(channelName) {
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
      redemptionTimeoutDuration: 60
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

  // SIMPLIFIED: Use bot's OAuth token for everything
  const botOAuthToken = process.env.TWITCH_OAUTH.replace('oauth:', '');

  // Create auth provider using bot's OAuth token
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
  const redemptionManager = new RedemptionEventSubManager();

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
        eventSubActive: eventSubStatus.activeChannels.includes(channelName)
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
    const username = user.name;

    console.log(`[${getTimestamp()}] info: RAID event: ${username} raided with ${viewers} viewers`);

    if (viewers >= 2) {
      try {
        const gameInfo = await getGame(username);
        const raidMessage = `Thank you @${username} for the raid of ${viewers}! They were last seen streaming [${gameInfo}]. Check them out @ https://www.twitch.tv/${username}`;

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
    const isModUp = isBroadcaster || isMod || isOwner;
    const isVIPUp = isVip || isModUp;

    // Log user permissions
    const permissions = [];
    if (isBroadcaster) permissions.push('broadcaster');
    if (isMod) permissions.push('moderator');
    if (isVip) permissions.push('vip');
    if (permissions.length > 0) {
      console.log(`[${getTimestamp()}] info: User ${user} has permissions: ${permissions.join(', ')}`);
    }

    // Configuration commands (broadcaster/owner only) - UPDATED
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
            `EventSub: ${status.eventSubActive ? 'Active' : 'Inactive'}`
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
          } else {
            await chatClient.say(channel, "Usage: !config redemption enable/disable | Setup OAuth at https://mr-ai.dev/auth");
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

        default:
          await chatClient.say(channel, "Config commands: !config status | !config enable | !config disable | !config redemption enable/disable | !config redemption-status | !config modstatus");
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

    // Bot Commands (existing command system)
    try {
      const commands = {};
      const glob = require("glob");
      const excludedCommands = [''];

      glob.sync(`${process.env.BOT_FULL_PATH}/bot-commands/*.js`).forEach(file => {
        const commandExports = require(file);
        const functionName = file.split('/').pop().replace('.js', '');

        if (excludedCommands.includes(functionName)) return;

        if (typeof commandExports[functionName] === 'function') {
          commands[functionName] = commandExports[functionName];
        }
      });

      Object.keys(commands).forEach(commandName => {
        const commandFunction = commands[commandName];
        const tmiCompatibleTags = {
          username: user,
          'display-name': msg.userInfo.displayName,
          badges: {
            broadcaster: isBroadcaster ? '1' : undefined,
            moderator: isMod ? '1' : undefined,
            vip: isVip ? '1' : undefined
          },
          // Add these permission flags
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
          console.log(`[${getTimestamp()}] error: Command ${commandName} failed:`, error.message);
        }
      });

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
  console.log(`[${getTimestamp()}] info: Monitoring chat messages...`);
}

main().catch(error => {
  console.error(`[${new Date().toISOString()}] FATAL ERROR:`, error);
  process.exit(1);
});