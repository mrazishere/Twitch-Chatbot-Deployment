async function main() {
  // Require necessary node modules
  // Make the variables inside the .env element available to our Node project
  require('dotenv').config();
  const tmi = require('tmi.js');

  // Twitch API
  const TwitchApi = require("node-twitch").default;
  const twitch = new TwitchApi({
    client_id: `${process.env.TWITCH_CLIENTID}`,
    client_secret: `${process.env.TWITCH_CLIENTSECRET}`
  });

  // TMI Twitch IRC Setup connection configurations
  // These include the channel, username and password
  const client = new tmi.Client({
    options: { debug: false, messagesLogLevel: "info" },
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
    channels: ["$$UPDATEHERE$$"]
    //channels: ChannelList
  });

  // Connect to the channel specified using the setings found in the configurations
  // Any error found shall be logged out in the console
  client.connect().catch(console.error);

  // Sleep/delay function
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // This is a function to get game information for a streamer that raided
  async function getGame(loginName) {
    const users = await twitch.getUsers(loginName);
    const user = users.data[0];
    const userId = user.id;

    const channels = await twitch.getChannelInformation({ broadcaster_id: userId });
    const channelInfo = channels.data[0];
    const game = channelInfo.game_name;
    //console.log(game);
    return game;
  }

  const { readMatchmakingFile } = require(`${process.env.BOT_FULL_PATH}/bot-commands/partyMatchmaking.js`);
  readMatchmakingFile();

  client.on('raided', (channel, username, viewers, tags) => {
    if (viewers >= 2) {
      getGame(username).then(function (gameInfo) {
        if (gameInfo == "") {
          gameInfo = "No game detected";
        }
        client.say(channel, "Thank you @" + username + " for the raid of " + viewers + "! They were last seen playing [" + gameInfo + "]. Check them out @ https://www.twitch.tv/" + username);
      })
        .catch(error => console.log("Error getting game info...."));
    }
  })

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

    // Bot Commands
    // Commands should sit on it's on .js file in "bot-commands" folder and called from the "new-template.js" file
    // Make sure to test this on existing channels before updating into template file.
    // If a command needs to be updated, this can be done centrally on the command.js file which should take effect on all channels.

    const commands = {};
    const glob = require("glob");

    const excludedCommands = ['']; // Add the commands you want to exclude here

    glob.sync(`${process.env.BOT_FULL_PATH}/bot-commands/*.js`).forEach(file => {
      const commandExports = require(file);
      const functionName = file.split('/').pop().replace('.js', '');

      if (excludedCommands.includes(functionName)) {
        return; // Skip this command
      }

      if (typeof commandExports[functionName] === 'function') {
        commands[functionName] = commandExports[functionName];
        commands[functionName](client, message, channel, tags);
      } else {
        console.log(`Invalid command: ${functionName}`);
        // Handle the error or invalid command here
      }
    });

    // Listen only on bot's channel
    if (channel.includes(process.env.TWITCH_USERNAME)) {
      switch (message.toLowerCase()) {
        default:
        // We shall convert the message into a string in which we shall check for its first word
        // and use the others for output
        //let mymessage = message.toString();

      }
    }

  });
}
main().catch(console.error);