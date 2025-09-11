async function main() {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

  const fs = require('fs');
  const fsPromises = require('fs').promises;
  const channelName = "new-template-hybrid";

  function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  console.log(`[${getTimestamp()}] Starting Mr-AI-is-Here bot (TMI.js) for channel: ${channelName}`);

  const tmi = require('tmi.js');
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
      excludedCommands: [] // Commands to exclude/disable for this channel
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

  // TMI.js client configuration
  const botOAuthToken = process.env.TWITCH_OAUTH; // TMI.js expects the full oauth: token

  console.log(`[${getTimestamp()}] info: Bot OAuth configured for ${channelName}`);
  if (channelConfig.moderationEnabled) {
    console.log(`[${getTimestamp()}] info: Moderation enabled - Bot will act as moderator (ensure bot has mod status)`);
  } else {
    console.log(`[${getTimestamp()}] info: Chat-only mode for ${channelName}`);
  }

  // Chat Bot Badge functionality - App Access Token management
  async function loadAppAccessToken() {
    try {
      const appTokenPath = path.resolve(__dirname, '../channel-configs/app-access-token.json');
      const data = await fsPromises.readFile(appTokenPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to load App Access Token:`, error.message);
      throw error;
    }
  }

  // Get user ID for API calls
  async function getUserId(username) {
    try {
      const appToken = await loadAppAccessToken();
      const response = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${appToken.access_token}`
        }
      });

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0].id;
      }
      throw new Error(`User ${username} not found`);
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to get user ID for ${username}:`, error.message);
      throw error;
    }
  }

  // Send chat message using Helix API for Chat Bot Badge
  async function sendChatMessageAPI(channelId, message) {
    try {
      const appToken = await loadAppAccessToken();
      const botUserId = await getUserId(process.env.TWITCH_USERNAME);

      const response = await axios.post('https://api.twitch.tv/helix/chat/messages', {
        broadcaster_id: channelId,
        sender_id: botUserId,
        message: message
      }, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${appToken.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[${getTimestamp()}] info: Message sent with Chat Bot Badge: ${message}`);
      return response.data;
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to send message via API:`, error.message);
      if (error.response) {
        console.error(`[${getTimestamp()}] error: Response status: ${error.response.status}`);
        console.error(`[${getTimestamp()}] error: Response data:`, error.response.data);
      }
      throw error;
    }
  }

  // Cache channel ID to avoid repeated API calls
  let cachedChannelId = null;
  async function getCachedChannelId() {
    if (!cachedChannelId) {
      cachedChannelId = await getUserId(channelName);
    }
    return cachedChannelId;
  }

  const client = new tmi.Client({
    options: { debug: false, messagesLogLevel: "info" },
    connection: {
      reconnect: true,
      secure: true
    },
    identity: {
      username: process.env.TWITCH_USERNAME,
      password: botOAuthToken
    },
    channels: [`#${channelName}`]
  });

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

  // Conduits functions for Users in Chat + Chat Bot Badge
  async function loadSharedConduit() {
    try {
      const conduitsPath = `${process.env.BOT_FULL_PATH}/channel-configs/shared-conduits.json`;
      if (fs.existsSync(conduitsPath)) {
        const conduitsData = JSON.parse(fs.readFileSync(conduitsPath, 'utf8'));
        if (conduitsData.conduits && conduitsData.conduits.length > 0) {
          console.log(`[${getTimestamp()}] info: ✅ Using shared conduit: ${conduitsData.conduits[0].id}`);
          return conduitsData.conduits[0];
        }
      }
      throw new Error('No shared conduits available');
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to load shared conduit:`, error.message);
      throw error;
    }
  }

  async function addWebSocketShard(conduitId, sessionId) {
    try {
      const appToken = await loadAppAccessToken();

      const response = await axios.patch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
        conduit_id: conduitId,
        shards: [{
          id: "0",
          transport: {
            method: "websocket",
            session_id: sessionId
          }
        }]
      }, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${appToken.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[${getTimestamp()}] info: ✅ WebSocket shard added to conduit`);
      return response.data;
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to add WebSocket shard:`, error.message);
      throw error;
    }
  }

  async function subscribeToEventSubViaConduit(conduitId, channelId) {
    try {
      const appToken = await loadAppAccessToken();
      const botUserId = await getUserId(process.env.TWITCH_USERNAME);

      const response = await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: channelId,
          user_id: botUserId
        },
        transport: {
          method: "conduit",
          conduit_id: conduitId
        }
      }, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${appToken.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[${getTimestamp()}] info: ✅ Subscribed to EventSub via conduit for Users in Chat listing`);
      return response.data;
    } catch (error) {
      console.error(`[${getTimestamp()}] error: Failed to subscribe via conduit:`, error.message);
      throw error;
    }
  }

  // Get game information using Twitch API directly
  async function getGame(loginName) {
    try {
      console.log(`[${getTimestamp()}] info: Getting game info for: ${loginName}`);

      // Direct Twitch API call instead of Twurple
      const userResponse = await axios.get(`https://api.twitch.tv/helix/users?login=${loginName}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${process.env.TWITCH_OAUTH.replace('oauth:', '')}`
        }
      });

      if (!userResponse.data.data || userResponse.data.data.length === 0) {
        return "No game detected";
      }

      const userId = userResponse.data.data[0].id;

      const channelResponse = await axios.get(`https://api.twitch.tv/helix/channels?broadcaster_id=${userId}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENTID,
          'Authorization': `Bearer ${process.env.TWITCH_OAUTH.replace('oauth:', '')}`
        }
      });

      const gameName = channelResponse.data.data?.[0]?.game_name || "No game detected";
      console.log(`[${getTimestamp()}] info: Game for ${loginName}: ${gameName}`);
      return gameName;
    } catch (error) {
      console.log(`[${getTimestamp()}] info: Error getting game info:`, error.message);
      return "No game detected";
    }
  }

  // Configuration management commands
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

  // Connect to chat with error handling
  console.log(`[${getTimestamp()}] info: Connecting to Twitch chat...`);
  try {
    await client.connect();
    console.log(`[${getTimestamp()}] info: Successfully joined #${channelName}`);
  } catch (error) {
    console.error(`[${getTimestamp()}] FATAL: Failed to connect to Twitch chat: ${error.message}`);
    console.error(`[${getTimestamp()}] FATAL: This usually indicates network issues or invalid OAuth token`);
    throw error;
  }

  // Setup Conduits for Users in Chat listing + Chat Bot Badge
  console.log(`[${getTimestamp()}] info: Setting up EventSub Conduits for Users in Chat listing...`);
  try {
    // Connect to EventSub WebSocket
    const WebSocket = require('ws');
    const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
    let sessionId = null;
    let conduitId = null;

    ws.on('open', () => {
      console.log(`[${getTimestamp()}] info: ✅ EventSub WebSocket connected for conduit`);
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.metadata?.message_type === 'session_welcome') {
          sessionId = message.payload.session.id;
          console.log(`[${getTimestamp()}] info: ✅ WebSocket session ID: ${sessionId}`);

          // Load shared conduit and setup subscription
          try {
            const conduit = await loadSharedConduit();
            conduitId = conduit.id;
            await addWebSocketShard(conduitId, sessionId);

            const channelId = await getCachedChannelId();
            await subscribeToEventSubViaConduit(conduitId, channelId);

            console.log(`[${getTimestamp()}] info: 🎉 Conduits setup complete - Bot should appear in Users in Chat list!`);
          } catch (error) {
            console.error(`[${getTimestamp()}] error: Conduits setup failed:`, error.message);
          }
        }

        // We don't need to handle notifications here since TMI.js handles chat

      } catch (error) {
        console.error(`[${getTimestamp()}] error: WebSocket message error:`, error.message);
      }
    });

    ws.on('error', (error) => {
      console.error(`[${getTimestamp()}] error: EventSub WebSocket error:`, error.message);
    });

    ws.on('close', () => {
      console.log(`[${getTimestamp()}] warning: EventSub WebSocket connection closed`);
    });

  } catch (error) {
    console.error(`[${getTimestamp()}] error: Failed to setup EventSub Conduits:`, error.message);
  }

  // Channel point redemptions handled by separate EventSub service
  if (channelConfig.redemptionEnabled) {
    console.log(`[${getTimestamp()}] info: ✅ Channel point redemptions enabled - managed by EventSub service`);
  } else {
    console.log(`[${getTimestamp()}] info: Channel point redemptions disabled for ${channelName}`);
  }

  // Handle raid events (TMI.js format)
  client.on('raided', async (channel, username, viewers) => {
    console.log(`[${getTimestamp()}] info: RAID event: ${username} raided with ${viewers} viewers`);

    if (viewers >= 2) {
      try {
        const gameInfo = await getGame(username.toLowerCase());
        const raidMessage = `Thank you @${username} for the raid of ${viewers}! They were last seen streaming [${gameInfo}]. Check them out @ https://www.twitch.tv/${username.toLowerCase()}`;

        await sendChatMessageAPI(await getCachedChannelId(), raidMessage);
        console.log(`[${getTimestamp()}] info: RAID response sent to ${channel}`);
      } catch (error) {
        console.log(`[${getTimestamp()}] error: RAID response failed:`, error.message);
      }
    } else {
      console.log(`[${getTimestamp()}] info: RAID ignored (less than 2 viewers)`);
    }
  });

  // Handle chat messages (TMI.js format)
  client.on('message', async (channel, tags, message, self) => {
    // Log every message
    console.log(`[${getTimestamp()}] info: [${channel}] <${tags['display-name'] || tags.username}>: ${message}`);

    // Don't respond to bot's own messages
    if (self) {
      //console.log(`[${getTimestamp()}] info: Ignoring own message`);
      return;
    }

    const user = tags.username.toLowerCase();

    // Set variables for user permission logic (TMI.js format)
    const isBroadcaster = tags.badges?.broadcaster === '1';
    const isMod = tags.badges?.moderator === '1' || isBroadcaster;
    const isVip = tags.badges?.vip === '1';
    const isSubscriber = tags.badges?.subscriber === '1';
    const isFounder = tags.badges?.founder === '1';
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

    // Configuration commands (broadcaster/owner only)
    if ((isBroadcaster || isOwner) && message.startsWith('!config')) {
      const args = message.split(' ');
      const command = args[1]?.toLowerCase();

      switch (command) {
        case 'status':
          const status = configCommands.getStatus();
          await sendChatMessageAPI(await getCachedChannelId(),
            `Mr-AI-is-Here Config (TMI.js) - Moderation: ${status.moderationEnabled ? 'Enabled' : 'Disabled'} | ` +
            `Mode: ${status.chatOnly ? 'Chat Only' : 'Full Features'} | ` +
            `Bot OAuth: ${status.botOAuth ? 'Active' : 'Missing'} | ` +
            `Redemptions: ${status.redemptionEnabled ? 'Enabled' : 'Disabled'} | ` +
            `Excluded Commands: ${status.excludedCommands.length}`
          );
          break;

        case 'enable':
          const enableResult = await configCommands.enableModeration();
          await sendChatMessageAPI(await getCachedChannelId(), `${enableResult.message} Restarting bot...`);
          if (enableResult.success) {
            console.log(`[${getTimestamp()}] info: Moderation enabled - restarting bot via process.exit(0)`);
            setTimeout(() => process.exit(0), 1000);
          }
          break;

        case 'disable':
          const disableResult = await configCommands.disableModeration();
          await sendChatMessageAPI(await getCachedChannelId(), `${disableResult.message} Restarting bot...`);
          if (disableResult.success) {
            console.log(`[${getTimestamp()}] info: Moderation disabled - restarting bot via process.exit(0)`);
            setTimeout(() => process.exit(0), 1000);
          }
          break;

        case 'redemption':
          const subCommand = args[2]?.toLowerCase();
          if (subCommand === 'enable') {
            const redemptionEnableResult = await configCommands.enableRedemption();
            await sendChatMessageAPI(await getCachedChannelId(), `${redemptionEnableResult.message} Restarting bot...`);
            if (redemptionEnableResult.success) {
              console.log(`[${getTimestamp()}] info: Redemption enabled - restarting bot via process.exit(0)`);
              setTimeout(() => process.exit(0), 1000);
            }
          } else if (subCommand === 'disable') {
            const redemptionDisableResult = await configCommands.disableRedemption();
            await sendChatMessageAPI(await getCachedChannelId(), `${redemptionDisableResult.message} Restarting bot...`);
            if (redemptionDisableResult.success) {
              console.log(`[${getTimestamp()}] info: Redemption disabled - restarting bot via process.exit(0)`);
              setTimeout(() => process.exit(0), 1000);
            }
          } else if (subCommand === 'duration') {
            const newDuration = parseInt(args[3]);
            if (newDuration && newDuration > 0 && newDuration <= 1209600) { // Max 14 days
              channelConfig.redemptionTimeoutDuration = newDuration;
              if (saveChannelConfig(channelName, channelConfig)) {
                await sendChatMessageAPI(await getCachedChannelId(), `Redemption timeout duration set to ${newDuration} seconds.`);
              } else {
                await sendChatMessageAPI(await getCachedChannelId(), "Failed to save timeout duration.");
              }
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), `Current timeout duration: ${channelConfig.redemptionTimeoutDuration} seconds. Usage: !config redemption duration <seconds>`);
            }
          } else {
            await sendChatMessageAPI(await getCachedChannelId(), "Usage: !config redemption enable/disable/duration <seconds> | Setup OAuth at https://mr-ai.dev/auth");
          }
          break;

        case 'redemption-status':
          await sendChatMessageAPI(await getCachedChannelId(),
            `Redemption Status: ${channelConfig.redemptionEnabled ? 'Enabled' : 'Disabled'} | ` +
            `Managed by EventSub service | ` +
            `Check service logs for EventSub status`
          );
          break;

        case 'modstatus':
          if (channelConfig.moderationEnabled) {
            await sendChatMessageAPI(await getCachedChannelId(), `Bot moderation enabled. Ensure ${process.env.TWITCH_USERNAME} has moderator status in this channel (/mod ${process.env.TWITCH_USERNAME})`);
          } else {
            await sendChatMessageAPI(await getCachedChannelId(), "Bot moderation disabled. Use !config enable to activate.");
          }
          break;

        case 'special':
          const specialAction = args[2]?.toLowerCase();
          const rawTargetUser = args[3];

          if (specialAction === 'add' && rawTargetUser) {
            const targetUser = rawTargetUser.toLowerCase();
            if (!validateChannelName(targetUser)) {
              await sendChatMessageAPI(await getCachedChannelId(), `Invalid username format: ${rawTargetUser}. Use only letters, numbers, and underscores.`);
              break;
            }

            if (!channelConfig.specialUsers.includes(targetUser)) {
              channelConfig.specialUsers.push(targetUser);
              if (saveChannelConfig(channelName, channelConfig)) {
                reloadChannelConfig();
                await sendChatMessageAPI(await getCachedChannelId(), `Added ${targetUser} as a special user.`);
              } else {
                await sendChatMessageAPI(await getCachedChannelId(), "Failed to save special user.");
              }
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), `${targetUser} is already a special user.`);
            }
          } else if (specialAction === 'remove' && rawTargetUser) {
            const targetUser = rawTargetUser.toLowerCase();
            if (!validateChannelName(targetUser)) {
              await sendChatMessageAPI(await getCachedChannelId(), `Invalid username format: ${rawTargetUser}. Use only letters, numbers, and underscores.`);
              break;
            }

            const index = channelConfig.specialUsers.indexOf(targetUser);
            if (index > -1) {
              channelConfig.specialUsers.splice(index, 1);
              if (saveChannelConfig(channelName, channelConfig)) {
                reloadChannelConfig();
                await sendChatMessageAPI(await getCachedChannelId(), `Removed ${targetUser} from special users.`);
              } else {
                await sendChatMessageAPI(await getCachedChannelId(), "Failed to remove special user.");
              }
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), `${targetUser} is not a special user.`);
            }
          } else if (specialAction === 'list') {
            const specialList = channelConfig.specialUsers.length > 0
              ? channelConfig.specialUsers.join(', ')
              : 'None';
            await sendChatMessageAPI(await getCachedChannelId(), `Special users: ${specialList}`);
          } else {
            await sendChatMessageAPI(await getCachedChannelId(), "Usage: !config special add/remove/list [username]");
          }
          break;

        case 'exclude':
          const excludeAction = args[2]?.toLowerCase();
          const rawCommandName = args[3];

          if (excludeAction === 'add' && rawCommandName) {
            const commandName = rawCommandName.toLowerCase();
            if (!/^[a-zA-Z0-9_-]{1,30}$/.test(commandName)) {
              await sendChatMessageAPI(await getCachedChannelId(), `Invalid command name: ${rawCommandName}. Use only letters, numbers, underscores, and hyphens.`);
              break;
            }

            if (!channelConfig.excludedCommands.includes(commandName)) {
              channelConfig.excludedCommands.push(commandName);
              if (saveChannelConfig(channelName, channelConfig)) {
                reloadCommands();
                await sendChatMessageAPI(await getCachedChannelId(), `Command "${commandName}" has been disabled for this channel.`);
              } else {
                await sendChatMessageAPI(await getCachedChannelId(), "Failed to save excluded command.");
              }
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), `Command "${commandName}" is already disabled.`);
            }
          } else if (excludeAction === 'remove' && rawCommandName) {
            const commandName = rawCommandName.toLowerCase();
            if (!/^[a-zA-Z0-9_-]{1,30}$/.test(commandName)) {
              await sendChatMessageAPI(await getCachedChannelId(), `Invalid command name: ${rawCommandName}. Use only letters, numbers, underscores, and hyphens.`);
              break;
            }

            const index = channelConfig.excludedCommands.indexOf(commandName);
            if (index > -1) {
              channelConfig.excludedCommands.splice(index, 1);
              if (saveChannelConfig(channelName, channelConfig)) {
                reloadCommands();
                await sendChatMessageAPI(await getCachedChannelId(), `Command "${commandName}" has been re-enabled for this channel.`);
              } else {
                await sendChatMessageAPI(await getCachedChannelId(), "Failed to remove excluded command.");
              }
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), `Command "${commandName}" is not currently disabled.`);
            }
          } else if (excludeAction === 'list') {
            const excludedList = channelConfig.excludedCommands.length > 0
              ? channelConfig.excludedCommands.join(', ')
              : 'None';
            await sendChatMessageAPI(await getCachedChannelId(), `Disabled commands: ${excludedList}`);
          } else {
            await sendChatMessageAPI(await getCachedChannelId(), "Usage: !config exclude add/remove/list [commandname]");
          }
          break;

        case 'location':
          const locationAction = args[2]?.toLowerCase();

          if (locationAction === 'set') {
            const rawLocation = args.slice(3).join(' ');

            if (!rawLocation) {
              await sendChatMessageAPI(await getCachedChannelId(), "Usage: !config location set [country name] (e.g., !config location set united states)");
              break;
            }

            const location = rawLocation.toLowerCase().trim();
            if (!/^[a-zA-Z\s\-']{2,50}$/.test(location)) {
              await sendChatMessageAPI(await getCachedChannelId(), "Invalid location. Use only letters, spaces, and hyphens (e.g., 'united states', 'south korea').");
              break;
            }

            channelConfig['irl-location'] = location;
            if (saveChannelConfig(channelName, channelConfig)) {
              reloadChannelConfig();
              await sendChatMessageAPI(await getCachedChannelId(), `Location set to: ${location}. This will be used for forex auto-conversion and timezone detection.`);
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), "Failed to save location setting.");
            }
          } else if (locationAction === 'get' || !locationAction) {
            const currentLocation = channelConfig['irl-location'] || 'Not set';
            await sendChatMessageAPI(await getCachedChannelId(), `Current location: ${currentLocation}`);
          } else if (locationAction === 'clear') {
            delete channelConfig['irl-location'];
            if (saveChannelConfig(channelName, channelConfig)) {
              reloadChannelConfig();
              await sendChatMessageAPI(await getCachedChannelId(), "Location cleared.");
            } else {
              await sendChatMessageAPI(await getCachedChannelId(), "Failed to clear location.");
            }
          } else {
            await sendChatMessageAPI(await getCachedChannelId(), "Usage: !config location set/get/clear [country name]");
          }
          break;

        default:
          await sendChatMessageAPI(await getCachedChannelId(), "Config commands: !config status | !config enable | !config disable | !config redemption enable/disable | !config redemption-status | !config modstatus | !config special add/remove/list [username] | !config exclude add/remove/list [commandname] | !config location set/get/clear [country]");
      }
      return;
    }

    // Check if moderation commands are being used without proper config
    if (isModUp && !channelConfig.moderationEnabled &&
      ['!timeout', '!ban', '!unban'].includes(message.split(' ')[0].toLowerCase())) {
      await sendChatMessageAPI(await getCachedChannelId(), `Moderation not enabled. Use !config enable to activate bot moderation.`);
      return;
    }

    // Check if bot has OAuth token for moderation
    if (isModUp && channelConfig.moderationEnabled && !process.env.TWITCH_OAUTH &&
      ['!timeout', '!ban', '!unban'].includes(message.split(' ')[0].toLowerCase())) {
      await sendChatMessageAPI(await getCachedChannelId(), "Bot OAuth token missing. Check bot configuration.");
      return;
    }

    // Bot Commands (command system with proper excluded command logging)
    try {
      const messageWords = message.split(' ');
      const potentialCommand = messageWords[0].toLowerCase();
      let isCommand = false;
      let requestedCommandName = '';

      // Check if message starts with a command trigger
      if (potentialCommand.startsWith('!')) {
        requestedCommandName = potentialCommand.substring(1);
        isCommand = true;
      }

      // Get excluded commands from channel config
      const excludedCommands = channelConfig.excludedCommands || [];

      // For command messages, check if the requested command is excluded FIRST
      if (isCommand && excludedCommands.includes(requestedCommandName)) {
        console.log(`[${getTimestamp()}] info: Command "${requestedCommandName}" is excluded for channel ${channelName} - blocking execution`);
        return;
      }

      // Execute ALL command functions for ALL messages (they handle their own filtering)
      Object.keys(commands).forEach(commandName => {
        const commandFunction = commands[commandName];

        // Create TMI.js compatible tags object for commands
        const tmiCompatibleTags = {
          username: user,
          'display-name': tags['display-name'],
          badges: {
            broadcaster: isBroadcaster ? '1' : undefined,
            moderator: isMod ? '1' : undefined,
            vip: isVip ? '1' : undefined,
            subscriber: isSubscriber ? '1' : undefined,
            founder: isFounder ? '1' : undefined
          },
          isModUp: isModUp,
          isVIPUp: isVIPUp,
          isSpecialUser: isSpecialUser,
          ...tags
        };

        const clientWrapper = {
          say: async (channel, message) => {
            console.log(`[${getTimestamp()}] info: Command response: ${message}`);
            return await sendChatMessageAPI(await getCachedChannelId(), message);
          }
        };

        try {
          commandFunction(clientWrapper, message, channel, tmiCompatibleTags);
        } catch (error) {
          // Only log actual errors, not "not our command" type messages
          if (error.message && !error.message.includes('Not our command')) {
            console.log(`[${getTimestamp()}] error: Command ${commandName} failed:`, error.message);
          }
        }
      });

    } catch (error) {
      console.log(`[${getTimestamp()}] error: Command processing failed:`, error.message);
    }
  });

  // Connection event handlers
  client.on('connected', (addr, port) => {
    console.log(`[${getTimestamp()}] info: Successfully connected to ${addr}:${port}`);
  });

  client.on('disconnected', (reason) => {
    console.log(`[${getTimestamp()}] warning: Disconnected from chat: ${reason}`);
  });

  client.on('reconnect', () => {
    console.log(`[${getTimestamp()}] info: Reconnecting to chat...`);
  });

  // Memory cleanup function
  function performMemoryCleanup() {
    try {
      if (global.gc) {
        global.gc();
        console.log(`[${getTimestamp()}] info: Manual garbage collection triggered`);
      }

      const memUsage = process.memoryUsage();
      const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };

      console.log(`[${getTimestamp()}] info: Memory usage - RSS: ${memUsageMB.rss}MB, Heap Used: ${memUsageMB.heapUsed}MB, Heap Total: ${memUsageMB.heapTotal}MB, External: ${memUsageMB.external}MB`);

      // Clear require cache for bot-commands
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

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`[${getTimestamp()}] info: Received SIGINT, shutting down gracefully...`);

    if (memoryCleanupInterval) {
      clearInterval(memoryCleanupInterval);
    }

    await client.disconnect();
    console.log(`[${getTimestamp()}] info: Mr-AI-is-Here bot (TMI.js) shut down complete`);
    process.exit(0);
  });

  // Enhanced error handling
  process.on('uncaughtException', (error) => {
    console.error(`[${getTimestamp()}] FATAL: Uncaught exception:`, error);
    console.error(`[${getTimestamp()}] FATAL: Bot will restart via PM2 to recover`);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${getTimestamp()}] FATAL: Unhandled rejection at:`, promise, 'reason:', reason);
    console.error(`[${getTimestamp()}] FATAL: Bot will restart via PM2 to recover`);
    process.exit(1);
  });

  console.log(`[${getTimestamp()}] info: Mr-AI-is-Here bot (TMI.js) ready for ${channelName} - Mode: ${channelConfig.chatOnly ? 'Chat Only' : 'Full Features'}`);
  console.log(`[${getTimestamp()}] info: Using bot OAuth token for all operations`);
  console.log(`[${getTimestamp()}] info: Moderation: ${channelConfig.moderationEnabled ? 'Enabled' : 'Disabled'} (Bot acts as moderator)`);
  console.log(`[${getTimestamp()}] info: Redemptions: ${channelConfig.redemptionEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`[${getTimestamp()}] info: Excluded Commands: ${channelConfig.excludedCommands?.length || 0}`);
  console.log(`[${getTimestamp()}] info: Monitoring chat messages...`);
}

// Enhanced error handling with detailed logging
main().catch(error => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] FATAL ERROR: Bot initialization failed`);
  console.error(`[${timestamp}] Error details:`, error.message);
  console.error(`[${timestamp}] Stack trace:`, error.stack);
  console.error(`[${timestamp}] Bot will restart via PM2 to recover`);

  setTimeout(() => {
    process.exit(1);
  }, 1000);
});