async function main() {
  // Require necessary node modules
  // Make the variables inside the .env element available to our Node project
  require('dotenv').config();
  const tmi = require('tmi.js');
  const fs = require('fs');
  const { exec } = require("child_process");

  // TMI Twitch IRC Setup connection configurations
  // These include the channel, username and password
  const client = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: {
      reconnect: true,
      secure: true
    },

    // Lack of the identity tags makes the bot anonymous and able to fetch messages from the channel
    // for reading, supervision, spying, or viewing purposes only
    identity: {
      username: `${process.env.TWITCH_USERNAME}`,
      password: `${process.env.TWITCH_OAUTH}`
    },
    channels: [`#${process.env.TWITCH_USERNAME}`]
  });

  // Connect to the channel specified using the setings found in the configurations
  // Any error found shall be logged out in the console
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

  // When the bot is on, it shall fetch the messages send by user from the specified channel
  client.on('message', (channel, tags, message, self) => {
    // Lack of this statement or it's inverse (!self) will make it in active
    if (self) return;
    // Create up a switch statement with some possible commands and their outputs
    // The input shall be converted to lowercase form first
    // The outputs shall be in the chats

    // Set variables for user permission logic
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1); //channel name (i.e. username)

    // Twitch API
    const TwitchApi = require("node-twitch").default;
    const twitch = new TwitchApi({
      client_id: `${process.env.TWITCH_CLIENTID}`,
      client_secret: `${process.env.TWITCH_CLIENTSECRET}`,
      //access_token: `${process.env.TWITCH_ACCESTOKEN}`,
      scopes: ["channel:read:subscriptions"],
      redirect_uri: `${process.env.TWITCH_redirecturi}`
    });

    /**
     * In development: to listen to chatbot chat for request to add or remove chatbot from twitch streamer chat
     * should automatically add into channel list.
     *
     * !addme will add requestor to TWITCH_CHANNEL in channel_list.js
     * !removeme will remove requestor from TWITCH_CHANNEL in channel_list.js
     * App will be restarted automatically with pm2 ecosystem file watching channel_list.js for any file change
     * No longer require cron job to restart app hourly
     *
     * TODO: Move channel_list.js to use replit db to store channels
     *
     *
     */

    // Set max number of channels to allow bot to be added to
    const maxChannels = `${process.env.MAX_CHANNELS}`;

    // Add bot Function
    async function addme() {
      currentTime = getTimestamp();
      input = message.split(" ");
      var addUser = `${tags.username}`;
      if (isModUp && input.length == 2) {
        addUser = input[1].toLowerCase();
        console.log(`$currentTime: @${tags.username} performed !addme as mod for ${addUser}`);
      }
      exec(`pm2 ls | grep "${addUser}"`, (error, stdout, stderr) => {
        if (error) {
          /**
           *
           * New process of creating new dedicated instance for new requests
           * 1. Check if instance exists
           * 2a. If yes, check if it's online - no action taken
           * 2b. If not online, send restart
           * 3. Instance does not exist, check if total active instance does not exceed maxChannels
           * 4. create new file using new-template.js content and modify $$UPDATEHERE$$ -> `#${tags.username}` with filename = channelname.js
           * 5. add new instance into channels/ecosystem.config.js for records, only used to quickly start all instances if pm2 service quit unexpectedly
           * 6. start the instance with pm2 start channelname.js
           *
           */
          console.log(`error: ${error.message}`);
          exec(`pm2 status | grep online | wc -l`, (error, stdout, stderr) => {
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
              let buffer = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/new-template.js`);
              const templateData = buffer.toString();
              newData = templateData.replace(
                "$$UPDATEHERE$$",
                `#${addUser}`
              );
              fs.writeFile(`${process.env.BOT_FULL_PATH}/channels/${addUser}.js`, newData, (err) => {
                if (err) throw err;
                console.log("Data written to file");
              });

              // Read the contents of the file into a string
              let config = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, 'utf8');

              // Insert the new app configuration into the apps array
              config = config.replace(/apps:\s*\[([\s\S]*?)\]/g, (match, p1) => {
                return `apps: [${p1}  ,
    {
      name: '${addUser}',
      script: '${process.env.BOT_FULL_PATH}/channels/${addUser}.js',
      log_date_format: 'YYYY-MM-DD',
      max_memory_restart: '100M',
    }
  ]`;
              });

              // Write the modified string back to the file
              fs.writeFileSync(`${process.env.BOT_FULL_PATH}/channels/ecosystem.config.js`, config, 'utf8');

              exec(
                `pm2 start ${process.env.BOT_FULL_PATH}/channels/${addUser}.js`,
                (error, stdout, stderr) => {
                  if (error) {
                    console.log(`error: ${error.message}`);
                    return;
                  }
                  if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    return;
                  }
                  console.log(`stdout: ${stdout}`);
                  client.say(
                    channel,
                    `Added successfully to #${addUser} chat. Check my about page for available commands. Whisper @MrAZisHere if you have any questions.`
                  );
                }
              );
            } else {
              client.say(
                channel,
                `New bot deployment is currently disabled due to max capacity(${maxChannels}). Whisper @MrAZisHere if you require this urgently for an exception.`
              );
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
          // Instance found but online, send a restart
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
            client.say(
              channel,
              `Restarting bot on #${addUser} chat. Check my about page for available commands. Whisper @MrAZisHere if you have any questions.`
            );
          });
        } else {
          // Instance found but offline, send a restart
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
            client.say(
              channel,
              `Bot is seen offline, restarting bot on #${addUser} chat. Check my about page for available commands. Whisper @MrAZisHere if you have any questions.`
            );
          });
        }
        return;
      });

      await sleep(5000);

      // Save PM2 state
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
      input = message.split(" ");
      var removeUser = `${tags.username}`;
      if (isModUp && input.length == 2) {
        removeUser = input[1].toLowerCase();
        console.log(`@${tags.username} performed !addme as mod for ${removeUser}`);
      }
      exec(`pm2 ls | grep "${removeUser}"`, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          client.say(
            channel,
            "Error: Already removed, !addme to add me to your channel"
          );
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          return;
        }
        console.log(`stdout: ${stdout}`);

        // checks if new dedicated instance
        // if yes, stop the instance
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
            client.say(
              channel,
              `Removed successfully from #${removeUser} chat. Whisper @MrAZisHere if you have any questions.`
            );
          });
        } else {
          client.say(
            channel,
            "Error: Already removed, !addme to add me to your channel"
          );
        }
      });
      await sleep(5000);

      // Save PM2 state
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

      return;
    }

    if (message.includes("!addme")) {
      addme();
    }

    if (message.includes("!removeme")) {
      removeme();
    }

  });
}
main().catch(console.error);