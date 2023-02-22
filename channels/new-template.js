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
    console.log(game);
    return game;
  }

  const { readMatchmakingFile } = require(`${process.env.BOT_FULL_PATH}/bot-commands/partyMatchmaking.js`);
  readMatchmakingFile();

  client.on('raided', (channel, username, viewers, tags) => {
    client.mods(channel).then((data) => {
      if (viewers >= 2) {
        if (data.includes(`${process.env.TWITCH_USERNAME}`)) {
          getGame(username).then(function (gameInfo) {
            if (gameInfo == "") {
              gameInfo = "No game detected";
            }
            console.log(gameInfo);
            client.say(channel, "/announce Thank you @" + username + " for the raid of " + viewers + "! They were last seen playing [" + gameInfo + "]. Check them out @ https://www.twitch.tv/" + username);
          })
            .catch(error => console.log("Error getting game info...."));
        } else {
          getGame(username).then(function (gameInfo) {
            if (gameInfo == "") {
              gameInfo = "No game detected";
            }
            console.log(gameInfo);
            client.say(channel, "Thank you @" + username + " for the raid of " + viewers + "! They were last seen playing [" + gameInfo + "]. Check them out @ https://www.twitch.tv/" + username);
          })
            .catch(error => console.log("Error getting game info...."));
        }
      }
    }).catch((err) => {

    });
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

    const glob = require("glob");
    const commandFiles = glob.sync(`${process.env.BOT_FULL_PATH}/bot-commands/*.js`);
    const commands = {};

    commandFiles.forEach(file => {
      const commandExports = require(file);
      Object.keys(commandExports).forEach(function (key) {
        commands[key] = commandExports[key];
      });
    });

    // Call whole command file
    commands["customCommands"](client, message, channel, tags);
    commands["translate"](client, message, channel, tags);

    if (message.includes("!advice")) {
      commands["advice"](client, message, channel, tags);
    }

    if (message.includes("!anime")) {
      commands["anime"](client, message, channel, tags);
    }

    if (message.includes("!catfacts")) {
      commands["catfacts"](client, message, channel, tags);
    }

    if (message.includes("!clock")) {
      commands["clock"](client, message, channel, tags);
    }

    if (message.includes("!settimezone")) {
      if (isModUp) {
        commands["settimezone"](client, message, channel, tags);
      } else {
        client.say(channel, `@${tags.username}, !settimezone is for Moderators & above.`);
        return;
      }
    }

    if (message.includes("!dad")) {
      if (message.includes("!daddy")) {
        return;
      } else {
        commands["dad"](client, message, channel, tags);
      }
    }

    // API Currently broken - under monitoring before removal
    if (message.includes("!dogfacts")) {
      commands["dogfacts"](client, message, channel, tags);
    }

    if (message.includes("!forex")) {
      commands["forex"](client, message, channel, tags);
    }

    if (message.includes("!jokes")) {
      commands["jokes"](client, message, channel, tags);
    }

    if (message.includes("!numfacts")) {
      commands["numfacts"](client, message, channel, tags);
    }

    if (message.includes("!mm")) {
      commands["partyMatchmaking"](client, channel, message, tags);
    }

    if (message.includes("!pokecatch")) {
      commands["pokecatch"](client, message, channel, tags);
    }

    if (message.includes("!snipecd")) {
      if (isModUp) {
        commands["countDown"](client, channel, message, tags);
      } else {
        client.say(channel, `@${tags.username}, !snipecd is for Moderators & above.`);
        return;
      }
    }

    if (message.includes("!yoda")) {
      commands["yoda"](client, message, channel, tags);
    }

    // Commands without dedicated .js files
    if (message === "!play to get in the race!") {
      async function marbles() {
        await sleep(4200);
        client.say(channel, `!play`);
      }
      marbles();
    }

    if (message === "The restaurant is now open for visitors! You can type !visit") {
      async function plateup() {
        client.say(channel, `!visit`);
      }
      plateup();
    }

    if (message === "!ping") {
      async function ping() {
        client.say(channel, `pong!`);
      }
      ping();
    }

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