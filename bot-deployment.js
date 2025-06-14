async function main() {
  // Require necessary node modules
  require('dotenv').config();
  const tmi = require('tmi.js');
  const fs = require('fs');
  const { exec } = require("child_process");
  const crypto = require('crypto');
  const axios = require('axios'); // NEW: Add axios for OAuth API calls

  // TMI Twitch IRC Setup connection configurations
  const client = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: {
      reconnect: true,
      secure: true
    },
    identity: {
      username: `${process.env.TWITCH_USERNAME}`,
      password: `${process.env.TWITCH_OAUTH}`
    },
    channels: [`#${process.env.TWITCH_USERNAME}`]
  });

  // Connect to the channel specified using the settings found in the configurations
  client.connect().catch(console.error);

  // Sleep/delay function
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // NEW: Function to check OAuth status via API
  async function checkOAuthStatus(channelName) {
    try {
      const response = await axios.get(`https://mr-ai.dev/auth/token?channel=${channelName}`);
      return {
        hasOAuth: true,
        username: response.data.username,
        source: 'OAuth Service'
      };
    } catch (error) {
      return {
        hasOAuth: false,
        error: error.response?.data?.error || error.message,
        source: 'None'
      };
    }
  }

  // NEW: Function to create default channel config (integrated with OAuth system)
  function createDefaultChannelConfig(channelName) {
    return {
      channelName: channelName,
      chatOnly: false,
      moderationEnabled: true,
      clientId: process.env.TWITCH_CLIENTID,
      moderatorUsername: channelName,
      lastUpdated: new Date().toISOString(),
      redemptionEnabled: true,
      redemptionRewardId: "",
      redemptionTimeoutDuration: 60,
      testMode: false,
      specialUsers: [],
      timeoutUsers: []
    };
  }

  // When the bot is on, it shall fetch the messages sent by user from the specified channel
  client.on('message', (channel, tags, message, self) => {
    if (self) return;

    // Set variables for user permission logic
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1);

    // Set max number of channels to allow bot to be added to
    const maxChannels = `${process.env.MAX_CHANNELS}`;

    // UPDATED: Add bot Function - Now creates default channel config
    async function addme() {
      const currentTime = getTimestamp();
      const input = message.split(" ");
      var addUser = `${tags.username}`;
      if (isModUp && input.length == 2) {
        addUser = input[1].toLowerCase();
        console.log(`${currentTime}: @${tags.username} performed !addme as mod for ${addUser}`);
      }

      exec(`pm2 ls | grep "${addUser}"`, async (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          exec(`pm2 status | grep online | wc -l`, async (error, stdout, stderr) => {
            if (error) {
              console.log(`error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
            }
            console.log(`stdout: ${stdout}`);

            if (parseInt(stdout) <= maxChannels) {
              // NEW: Create default channel config when adding bot
              const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;
              const configPath = `${configDir}/${addUser}.json`;

              try {
                if (!fs.existsSync(configDir)) {
                  fs.mkdirSync(configDir, { recursive: true });
                }

                if (!fs.existsSync(configPath)) {
                  const defaultConfig = createDefaultChannelConfig(addUser);
                  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
                  console.log(`Created default config for ${addUser}`);
                }
              } catch (configError) {
                console.log(`Warning: Could not create config for ${addUser}:`, configError.message);
              }

              // Use the updated Twurple template file
              let buffer = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/new-template(new).js`);
              const templateData = buffer.toString();
              const newData = templateData.replace(
                "$$UPDATEHERE$$",
                `${addUser}`
              );

              fs.writeFile(`${process.env.BOT_FULL_PATH}/channels/${addUser}.js`, newData, (err) => {
                if (err) throw err;
                console.log(`Data written to file for ${addUser}`);
              });

              // Update ecosystem.config.js
              try {
                let config = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, 'utf8');
                config = config.replace(/apps:\s*\[([\s\S]*?)\]/g, (match, p1) => {
                  return `apps: [${p1}  ,
    {
      name: '${addUser}',
      script: '${process.env.BOT_FULL_PATH}/channels/${addUser}.js',
      log_date_format: 'YYYY-MM-DD',
      max_memory_restart: '100M',
      watch: ['${process.env.BOT_FULL_PATH}/channel-configs/${addUser}.json'],
      watch_delay: 2000,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      watch_options: {
        followSymlinks: false
      }
    }
  ]`;
                });
                fs.writeFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, config, 'utf8');
              } catch (err) {
                const config = `
module.exports = {
  apps: [
    {
      name: '${addUser}',
      script: '${process.env.BOT_FULL_PATH}/channels/${addUser}.js',
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: "100M",
      max_restarts: "3",
      min_uptime: "5000"
    }
  ]
}`;
                try {
                  fs.writeFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, config);
                } catch (err) {
                  console.error(err);
                }
              }

              exec(`pm2 start ${process.env.BOT_FULL_PATH}/channels/${addUser}.js`, (error, stdout, stderr) => {
                if (error) {
                  console.log(`error: ${error.message}`);
                  return;
                }
                if (stderr) {
                  console.log(`stderr: ${stderr}`);
                  return;
                }
                console.log(`stdout: ${stdout}`);
                client.say(channel, `Added Mr-AI-is-Here bot to #${addUser}! 🚀 Generate OAuth tokens at https://mr-ai.dev/auth to enable full features. Check my about page for available commands.`);
              });
            } else {
              client.say(channel, `New bot deployment is currently disabled due to max capacity(${maxChannels}). Whisper @${process.env.TWITCH_OWNER} if you require this urgently for an exception.`);
            }
          });
          return;
        }

        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);

        if (stdout.includes("online")) {
          exec(`pm2 restart "${addUser}"`, (error, stdout, stderr) => {
            if (error) {
              console.log(`error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
            client.say(channel, `Restarting Mr-AI-is-Here bot for #${addUser}! 🔄 Generate OAuth tokens at https://mr-ai.dev/auth for full features.`);
          });
        } else {
          exec(`pm2 restart "${addUser}"`, (error, stdout, stderr) => {
            if (error) {
              console.log(`error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
            client.say(channel, `Bot was offline, restarting Mr-AI-is-Here bot for #${addUser}! 🔄 Generate OAuth tokens at https://mr-ai.dev/auth for full features.`);
          });
        }
      });

      await sleep(5000);
      exec(`pm2 save`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
      });
    }

    // Remove bot Function
    async function removeme() {
      const input = message.split(" ");
      var removeUser = `${tags.username}`;
      if (isModUp && input.length == 2) {
        removeUser = input[1].toLowerCase();
        console.log(`@${tags.username} performed !removeme as mod for ${removeUser}`);
      }

      exec(`pm2 ls | grep "${removeUser}"`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          client.say(channel, "Error: Already removed, !addme to add me to your channel");
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);

        if (stdout.includes("online")) {
          exec(`pm2 stop "${removeUser}"`, (error, stdout, stderr) => {
            if (error) {
              console.log(`error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
            client.say(channel, `Removed Mr-AI-is-Here bot from #${removeUser} chat. Whisper @${process.env.TWITCH_OWNER} if you have any questions.`);
          });
        } else {
          client.say(channel, "Error: Already removed, !addme to add me to your channel");
        }
      });

      await sleep(5000);
      exec(`pm2 save`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
      });
    }

    // Test migration on a single channel
    async function testmigrate() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !testmigrate <username> - Test migration on a single channel");
        return;
      }

      const testChannel = input[1].toLowerCase();
      const testFile = `${process.env.BOT_FULL_PATH}/channels/${testChannel}.js`;

      if (!fs.existsSync(testFile)) {
        client.say(channel, `Error: ${testChannel}.js does not exist`);
        return;
      }

      try {
        // Backup original
        const oldData = fs.readFileSync(testFile, "utf8");
        fs.writeFileSync(`${testFile}.backup`, oldData, "utf8");

        // Read new template
        const newTemplate = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/new-template(new).js`, "utf8");

        // Replace placeholder
        const newData = newTemplate.replace(/\$\$UPDATEHERE\$\$/g, testChannel);

        // Write new version
        fs.writeFileSync(testFile, newData, "utf8");

        // Restart the specific instance
        exec(`pm2 restart "${testChannel}"`, (error, stdout, stderr) => {
          if (error) {
            client.say(channel, `Migration test failed for ${testChannel}: ${error.message}`);
            // Auto-rollback on failure
            fs.writeFileSync(testFile, oldData, "utf8");
            exec(`pm2 restart "${testChannel}"`);
            return;
          }
          client.say(channel, `✅ Test migration successful for ${testChannel}! Use !rollback ${testChannel} to revert, or !batchmigrate to continue.`);
        });

      } catch (error) {
        client.say(channel, `Error during test migration: ${error.message}`);
      }
    }

    // Rollback a specific channel
    async function rollback() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !rollback <username> - Rollback a specific channel");
        return;
      }

      const rollbackChannel = input[1].toLowerCase();
      const channelFile = `${process.env.BOT_FULL_PATH}/channels/${rollbackChannel}.js`;
      const backupFile = `${channelFile}.backup`;

      if (!fs.existsSync(backupFile)) {
        client.say(channel, `Error: No backup found for ${rollbackChannel}`);
        return;
      }

      try {
        const backupData = fs.readFileSync(backupFile, "utf8");
        fs.writeFileSync(channelFile, backupData, "utf8");

        exec(`pm2 restart "${rollbackChannel}"`, (error, stdout, stderr) => {
          if (error) {
            client.say(channel, `Rollback failed for ${rollbackChannel}: ${error.message}`);
            return;
          }
          client.say(channel, `✅ Rolled back ${rollbackChannel} successfully`);
        });

      } catch (error) {
        client.say(channel, `Error during rollback: ${error.message}`);
      }
    }

    // Updated redeploy function with watch functionality
    async function redeploy() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const files = fs.readdirSync(`${process.env.BOT_FULL_PATH}/channels`);
      let redeployCount = 0;
      let appsConfig = [];

      files.forEach((file) => {
        if (file != "ecosystem.config.js" &&
          file != "new-template.js" &&
          file != "new-template(new).js" &&
          file != ".gitignore" &&
          !file.endsWith('.backup')) {

          const data = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/new-template(new).js`, "utf8");
          const channelname = file.replace(".js", "");
          const result = data.replace(/\$\$UPDATEHERE\$\$/g, channelname);

          // Update bot file
          fs.writeFileSync(`${process.env.BOT_FULL_PATH}/channels/${file}`, result, "utf8");

          // Prepare ecosystem config entry with watch enabled
          const configPath = `${process.env.BOT_FULL_PATH}/channel-configs/${channelname}.json`;
          appsConfig.push(`    {
      name: '${channelname}',
      script: '${process.env.BOT_FULL_PATH}/channels/${channelname}.js',
      log_date_format: 'YYYY-MM-DD',
      max_memory_restart: '100M',
      watch: ['${configPath}'],
      watch_delay: 2000,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      watch_options: {
        followSymlinks: false
      }
    }`);

          redeployCount++;
        }
      });

      // Generate new ecosystem.config.js with watch enabled for all bots
      const newEcosystemConfig = `module.exports = {
  apps: [
${appsConfig.join(',\n')}
  ]
}`;

      // Write the updated ecosystem config
      fs.writeFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, newEcosystemConfig);

      // Reload PM2 configuration to apply watch settings
      exec(`cd ${process.env.BOT_FULL_PATH}/channels && pm2 reload ecosystem.config.js`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          client.say(channel, `Redeployed ${redeployCount} bots but failed to enable file watching: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);

        client.say(channel, `✅ Redeployed & restarted ${redeployCount} Mr-AI-is-Here bots with new template! File watching enabled for OAuth auto-restart. OAuth tokens at https://mr-ai.dev/auth`);
      });
    }

    // Batch migration function
    async function batchmigrate() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      const batchSize = input[1] ? parseInt(input[1]) : 5; // Default 5 at a time

      const files = fs.readdirSync(`${process.env.BOT_FULL_PATH}/channels`);
      const channelFiles = files.filter(file =>
        file != "ecosystem.config.js" &&
        file != "new-template.js" &&
        file != "new-template(new).js" &&
        file != ".gitignore" &&
        !file.endsWith('.backup') &&
        file.endsWith('.js')
      );

      // Exclude already migrated channels
      const pendingFiles = channelFiles.filter(file => {
        const channelname = file.replace(".js", "");
        return channelname !== "mrazishere"; // Skip already migrated test channel
      });

      if (pendingFiles.length === 0) {
        client.say(channel, "No channels need migration!");
        return;
      }

      client.say(channel, `Starting batch migration of ${pendingFiles.length} channels in batches of ${batchSize}...`);

      let processed = 0;
      let successful = 0;
      let failed = 0;

      // Process in batches with delay
      for (let i = 0; i < pendingFiles.length; i += batchSize) {
        const batch = pendingFiles.slice(i, i + batchSize);

        for (const file of batch) {
          const channelname = file.replace(".js", "");
          const channelFile = `${process.env.BOT_FULL_PATH}/channels/${file}`;

          try {
            // Backup
            const oldData = fs.readFileSync(channelFile, "utf8");
            fs.writeFileSync(`${channelFile}.backup`, oldData, "utf8");

            // NEW: Create default config if it doesn't exist
            const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;
            const configPath = `${configDir}/${channelname}.json`;

            if (!fs.existsSync(configPath)) {
              if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
              }
              const defaultConfig = createDefaultChannelConfig(channelname);
              fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            }

            // Migrate
            const newTemplate = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/new-template(new).js`, "utf8");
            const newData = newTemplate.replace(/\$\$UPDATEHERE\$\$/g, channelname);
            fs.writeFileSync(channelFile, newData, "utf8");

            // Restart
            exec(`pm2 restart "${channelname}"`);
            successful++;
            console.log(`Successfully migrated ${channelname}`);

          } catch (error) {
            console.log(`Failed to migrate ${channelname}: ${error.message}`);
            failed++;
          }

          processed++;
        }

        // Progress update
        client.say(channel, `Batch ${Math.ceil((i + batchSize) / batchSize)} completed. Processed: ${processed}/${pendingFiles.length}`);

        // Wait between batches to avoid overwhelming PM2
        if (i + batchSize < pendingFiles.length) {
          await sleep(10000); // 10 second delay between batches
        }
      }

      client.say(channel, `Migration complete! ✅ Successful: ${successful} ❌ Failed: ${failed}. Use !rollbackall if issues occur.`);
    }

    // Emergency rollback all function
    async function rollbackall() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      client.say(channel, "🚨 Emergency rollback initiated...");

      const files = fs.readdirSync(`${process.env.BOT_FULL_PATH}/channels`);
      let rolledBack = 0;

      files.forEach(file => {
        if (file.endsWith('.backup')) {
          const originalFile = file.replace('.backup', '');
          const backupPath = `${process.env.BOT_FULL_PATH}/channels/${file}`;
          const originalPath = `${process.env.BOT_FULL_PATH}/channels/${originalFile}`;

          try {
            const backupData = fs.readFileSync(backupPath, "utf8");
            fs.writeFileSync(originalPath, backupData, "utf8");

            const channelname = originalFile.replace('.js', '');
            exec(`pm2 restart "${channelname}"`);
            rolledBack++;

          } catch (error) {
            console.log(`Failed to rollback ${originalFile}: ${error.message}`);
          }
        }
      });

      client.say(channel, `🔄 Emergency rollback complete! Restored ${rolledBack} channels to previous versions.`);
    }

    // UPDATED: Enable moderation function (now OAuth-aware)
    async function enableModeration() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !enablemod <channel> - Enable moderation (OAuth required at https://mr-ai.dev/auth)");
        return;
      }

      const targetChannel = input[1].toLowerCase();
      const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;
      const configPath = `${configDir}/${targetChannel}.json`;

      try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        // Load existing config or create default
        let config;
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
          config = createDefaultChannelConfig(targetChannel);
        }

        // Update moderation settings
        config.moderationEnabled = true;
        config.chatOnly = false;
        config.moderatorUsername = targetChannel;
        config.lastUpdated = new Date().toISOString();

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Check OAuth status
        const oauthStatus = await checkOAuthStatus(targetChannel);

        // Restart the bot instance to apply changes
        exec(`pm2 restart "${targetChannel}"`, (error, stdout, stderr) => {
          if (error) {
            client.say(channel, `Failed to restart ${targetChannel}: ${error.message}`);
            return;
          }

          if (oauthStatus.hasOAuth) {
            client.say(channel, `✅ Moderation enabled for #${targetChannel}! OAuth token detected. Bot restarted with full features.`);
          } else {
            client.say(channel, `⚠️ Moderation enabled for #${targetChannel} but no OAuth token found. Generate token at https://mr-ai.dev/auth for full features.`);
          }
        });

      } catch (error) {
        client.say(channel, `Error enabling moderation for ${targetChannel}: ${error.message}`);
      }
    }

    // UPDATED: Disable moderation function
    async function disableModeration() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !disablemod <channel>");
        return;
      }

      const targetChannel = input[1].toLowerCase();
      const configPath = `${process.env.BOT_FULL_PATH}/channel-configs/${targetChannel}.json`;

      try {
        let config;
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
          config = createDefaultChannelConfig(targetChannel);
        }

        config.moderationEnabled = false;
        config.chatOnly = true;
        config.lastUpdated = new Date().toISOString();

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // Restart the bot instance to apply changes
        exec(`pm2 restart "${targetChannel}"`, (error, stdout, stderr) => {
          if (error) {
            client.say(channel, `Failed to restart ${targetChannel}: ${error.message}`);
            return;
          }
          client.say(channel, `✅ Moderation disabled for #${targetChannel}! Bot restarted in chat-only mode.`);
        });

      } catch (error) {
        client.say(channel, `Error disabling moderation for ${targetChannel}: ${error.message}`);
      }
    }

    // UPDATED: Check moderation status function (now OAuth-aware)
    async function checkModerationStatus() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      const targetChannel = input[1]?.toLowerCase();

      if (targetChannel) {
        // Check specific channel
        const configPath = `${process.env.BOT_FULL_PATH}/channel-configs/${targetChannel}.json`;

        try {
          let config;
          if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          } else {
            config = { moderationEnabled: false, chatOnly: true };
          }

          // Check OAuth status
          const oauthStatus = await checkOAuthStatus(targetChannel);

          client.say(channel,
            `#${targetChannel}: Moderation ${config.moderationEnabled ? 'Enabled' : 'Disabled'} | ` +
            `OAuth ${oauthStatus.hasOAuth ? '✅' : '❌'} | ` +
            `Mode: ${config.chatOnly ? 'Chat Only' : 'Full Features'} | ` +
            `Updated: ${config.lastUpdated || 'Default'}`
          );
        } catch (error) {
          client.say(channel, `Error checking ${targetChannel}: ${error.message}`);
        }
      } else {
        // Check all channels
        const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;

        try {
          if (fs.existsSync(configDir)) {
            const configFiles = fs.readdirSync(configDir).filter(file => file.endsWith('.json'));
            let moderationEnabled = 0;
            let oauthEnabled = 0;
            let totalChannels = configFiles.length;

            // Check OAuth status for all channels (limit to avoid rate limits)
            const sampleSize = Math.min(5, totalChannels);
            for (let i = 0; i < sampleSize; i++) {
              try {
                const config = JSON.parse(fs.readFileSync(`${configDir}/${configFiles[i]}`, 'utf8'));
                if (config.moderationEnabled) moderationEnabled++;

                const channelName = configFiles[i].replace('.json', '');
                const oauthStatus = await checkOAuthStatus(channelName);
                if (oauthStatus.hasOAuth) oauthEnabled++;
              } catch (error) {
                console.log(`Error checking ${configFiles[i]}: ${error.message}`);
              }
            }

            client.say(channel, `Mr-AI-is-Here Status: ${moderationEnabled}/${totalChannels} moderation enabled | ${oauthEnabled}/${sampleSize} OAuth active (sample)`);
          } else {
            client.say(channel, "No channel configurations found");
          }
        } catch (error) {
          client.say(channel, `Error checking status: ${error.message}`);
        }
      }
    }

    // UPDATED: List channel configs function (now OAuth-aware)
    async function listChannelConfigs() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;

      try {
        if (fs.existsSync(configDir)) {
          const configFiles = fs.readdirSync(configDir).filter(file => file.endsWith('.json'));

          if (configFiles.length === 0) {
            client.say(channel, "No channel configurations found");
            return;
          }

          let response = "Mr-AI-is-Here Configs: ";
          const limit = Math.min(10, configFiles.length); // Limit to prevent message overflow

          for (let i = 0; i < limit; i++) {
            try {
              const config = JSON.parse(fs.readFileSync(`${configDir}/${configFiles[i]}`, 'utf8'));
              const channelName = config.channelName;
              const status = config.moderationEnabled ? "MOD" : "CHAT";
              response += `${channelName}(${status}) `;
            } catch (error) {
              console.log(`Error reading ${configFiles[i]}: ${error.message}`);
            }
          }

          if (configFiles.length > limit) {
            response += `... and ${configFiles.length - limit} more`;
          }

          client.say(channel, response);
        } else {
          client.say(channel, "No channel configurations directory found");
        }
      } catch (error) {
        client.say(channel, `Error listing configs: ${error.message}`);
      }
    }

    // NEW: OAuth status command
    async function checkOAuthStatusCommand() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !oauthstatus <channel> - Check OAuth status for a channel");
        return;
      }

      const targetChannel = input[1].toLowerCase();

      try {
        const oauthStatus = await checkOAuthStatus(targetChannel);

        if (oauthStatus.hasOAuth) {
          client.say(channel, `✅ #${targetChannel}: OAuth active (${oauthStatus.username}) via ${oauthStatus.source}`);
        } else {
          client.say(channel, `❌ #${targetChannel}: No OAuth token. Generate at https://mr-ai.dev/auth`);
        }
      } catch (error) {
        client.say(channel, `Error checking OAuth for ${targetChannel}: ${error.message}`);
      }
    }

    // NEW: Bulk OAuth status check
    async function bulkOAuthCheck() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      client.say(channel, "🔍 Checking OAuth status for all channels...");

      const configDir = `${process.env.BOT_FULL_PATH}/channel-configs`;

      try {
        if (fs.existsSync(configDir)) {
          const configFiles = fs.readdirSync(configDir).filter(file => file.endsWith('.json'));
          let withOAuth = 0;
          let withoutOAuth = 0;
          let errors = 0;

          const limit = Math.min(20, configFiles.length);

          for (let i = 0; i < limit; i++) {
            try {
              const channelName = configFiles[i].replace('.json', '');
              const oauthStatus = await checkOAuthStatus(channelName);

              if (oauthStatus.hasOAuth) {
                withOAuth++;
              } else {
                withoutOAuth++;
              }

              await sleep(100);
            } catch (error) {
              errors++;
              console.log(`Error checking OAuth for ${configFiles[i]}: ${error.message}`);
            }
          }

          client.say(channel,
            `OAuth Status Check (${limit}/${configFiles.length} channels): ` +
            `✅ ${withOAuth} with OAuth | ❌ ${withoutOAuth} without OAuth | ⚠️ ${errors} errors`
          );

          if (configFiles.length > limit) {
            client.say(channel, `Note: Checked ${limit}/${configFiles.length} channels to avoid rate limits`);
          }
        } else {
          client.say(channel, "No channel configurations found");
        }
      } catch (error) {
        client.say(channel, `Error during bulk OAuth check: ${error.message}`);
      }
    }

    // NEW: Generate OAuth reminder command
    async function oauthReminder() {
      if (!isModUp) {
        client.say(channel, "Error: You are not a mod");
        return;
      }

      const input = message.split(" ");
      if (input.length < 2) {
        client.say(channel, "Usage: !oauthreminder <channel> - Send OAuth generation reminder");
        return;
      }

      const targetChannel = input[1].toLowerCase();

      try {
        const oauthStatus = await checkOAuthStatus(targetChannel);

        if (oauthStatus.hasOAuth) {
          client.say(channel, `#${targetChannel} already has OAuth tokens configured ✅`);
        } else {
          try {
            client.say(`#${targetChannel}`,
              `🔐 Hi @${targetChannel}! Generate OAuth tokens for Mr-AI-is-Here bot at https://mr-ai.dev/auth ` +
              `to unlock moderation and advanced features! Just sign in with your Twitch account.`
            );
            client.say(channel, `✅ OAuth reminder sent to #${targetChannel}`);
          } catch (sendError) {
            client.say(channel, `❌ Could not send reminder to #${targetChannel}. Bot may not be active in that channel.`);
          }
        }
      } catch (error) {
        client.say(channel, `Error sending OAuth reminder: ${error.message}`);
      }
    }

    // Command handlers
    if (message.split(" ")[0] === "!addme") {
      addme();
    }

    if (message.split(" ")[0] === "!removeme") {
      removeme();
    }

    if (message.split(" ")[0] === "!redeploy") {
      redeploy();
    }

    if (message.split(" ")[0] === "!testmigrate") {
      testmigrate();
    }

    if (message.split(" ")[0] === "!rollback") {
      rollback();
    }

    if (message.split(" ")[0] === "!batchmigrate") {
      batchmigrate();
    }

    if (message.split(" ")[0] === "!rollbackall") {
      rollbackall();
    }

    if (message.split(" ")[0] === "!grantaccess") {
      //grantAccessTwitchAPI();
    }

    if (message.split(" ")[0] === "!enablemod") {
      enableModeration();
    }

    if (message.split(" ")[0] === "!disablemod") {
      disableModeration();
    }

    if (message.split(" ")[0] === "!modstatus") {
      checkModerationStatus();
    }

    if (message.split(" ")[0] === "!listconfigs") {
      listChannelConfigs();
    }

    if (message.split(" ")[0] === "!oauthstatus") {
      checkOAuthStatusCommand();
    }

    if (message.split(" ")[0] === "!bulkoauth") {
      bulkOAuthCheck();
    }

    if (message.split(" ")[0] === "!oauthreminder") {
      oauthReminder();
    }

    if (message.split(" ")[0] === "!help" && isModUp) {
      const helpMessage =
        "Mr-AI-is-Here Admin Commands: " +
        "!addme <user> | !removeme <user> | !redeploy | " +
        "!enablemod <channel> | !disablemod <channel> | !modstatus [channel] | " +
        "!oauthstatus <channel> | !bulkoauth | !oauthreminder <channel> | " +
        "!testmigrate <channel> | !batchmigrate [size] | !rollback <channel> | !rollbackall | " +
        "OAuth Dashboard: https://mr-ai.dev/auth";

      client.say(channel, helpMessage);
    }
  });
}

main().catch(console.error);
