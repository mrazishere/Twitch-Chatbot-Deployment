/**
 * Clock command
 * 
 * Description: Allow streamer to display clock based on the timezone set directly from Twitch chat
 * 
 * Credits: https://www.timeapi.io/
 * 
 * Permission required:
 *          !settimezone: Moderators and above
 *          !clock: all users
 * 
 * Usage:   !clock - See time based on Streamer's timezone
 *          !settimezone<SPACE>[Zone ID] - refer to https://nodatime.org/TimeZones
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function
const fs = require('fs');

// Sleep function
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.clock = async function clock(client, message, channel, tags) {
  // Set variables for user permission logic
  const badges = tags.badges || {};
  const isBroadcaster = badges.broadcaster;
  const isMod = badges.moderator;
  const isVIP = badges.vip;
  const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
  const isVIPUp = isVIP || isModUp;
  const channel1 = channel.substring(1); //channel name (i.e. username)
  input = message.split(" ");
  if (input[0] === "!settimezone") {
    if (isModUp) {
      if (input.length != 2) {
        client.say(channel, `@${tags.username}, invalid use of command. !settimezone[SPACE]<Zone ID> - refer to https://nodatime.org/TimeZones`);
      } else if (isModUp) {
        var chTZ = input[1];
        const fetchResponse = await fetch('https://www.timeapi.io/api/TimeZone/zone?timeZone=' + chTZ, { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
          .then(response => {
            if (response.ok) {
              response.json().then((data) => {
                var outputArr = JSON.parse(JSON.stringify(data));
              });
              let file = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channel_timezone.js`, "utf8");
              let arr = file.split(/\r?\n/);
              arr.forEach((line, idx) => {
                console.log(line);
                if (line.includes("var Channel_Timezone =")) {
                  var channelTimezoneString = line.split("= ").pop();
                  channelTimezoneObject = JSON.parse(channelTimezoneString.replace(/'/g, '"'));
                }
              });
              channelTimezoneObject[channel1] = chTZ;
              channelTimezoneNewString = JSON.stringify(channelTimezoneObject);
              fs.readFile(`${process.env.BOT_FULL_PATH}/channel_timezone.js`, { encoding: 'utf8' }, function (err, data) {
                const regex = /^var.*/gm;
                const string1 = 'var Channel_Timezone = ';
                var formatted = string1.concat(data.replace(regex, channelTimezoneNewString));
                fs.writeFile(`${process.env.BOT_FULL_PATH}/channel_timezone.js`, formatted, 'utf8', function (err) {
                  if (err) return console.log(err);
                  client.say(channel, 'Timezone for ' + channel1 + ' successfully set to ' + chTZ + '. !clock to display current local time.');
                });
              });
            } else {
              client.say(channel, "Invalid Zone ID! Make sure you enter valid Zone ID per https://nodatime.org/TimeZones");
            }
          }).
          catch(error => {
            console.log(error);
          });
      }
      return;
    } else {
      client.say(channel, `@${tags.username}, !settimezone is for Moderators & above.`);
      return;
    }
  }
  if (input[0] === "!clock") {
    const channel1 = channel.substring(1); //channel name (i.e. username)
    let file = fs.readFileSync(`${process.env.BOT_FULL_PATH}/channel_timezone.js`, "utf8");
    let arr = file.split(/\r?\n/);
    arr.forEach((line, idx) => {
      if (line.includes("var Channel_Timezone =")) {
        var channelTimezoneString = line.split("= ").pop();
        channelTimezoneObject = JSON.parse(channelTimezoneString.replace(/'/g, '"'));
      }
    });
    chTZ = channelTimezoneObject[channel1];
    if (input.length != 1) {
      client.say(channel, `@${tags.username}, This command does not accept any input, just enter !clock to get ` + channel + `'s local time.`);
    } else if (input.length == 1) {
      if (channelTimezoneObject.hasOwnProperty(channel1)) {
        var chTZ = channelTimezoneObject[channel1];
        const fetchResponse = await fetch('https://www.timeapi.io/api/Time/current/zone?timeZone=' + chTZ, { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
          .then(response => {
            if (response.ok) {
              response.json().then((data) => {
                var outputArr = JSON.parse(JSON.stringify(data));
                var output1 = outputArr['date'];
                var output2 = outputArr['time'];
                var output3 = outputArr['timeZone'].split("/");
                var output4 = outputArr['dayOfWeek'];
                sleep(1000);
                //console.log("The current time in " + output3[output3.length - 1] + " is " + output2 + "h - " + output4 + ", " + output1);
                client.say(channel, "The current time in " + output3[output3.length - 1] + " is " + output2 + "h - " + output4 + ", " + output1);
              });
            } else {
              client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
            }
          }).
          catch(error => {
            console.log(error);
          });
      } else {
        //console.log("No timezone set for: " + channel1 + ". !settimezone[SPACE]<Zone ID> - refer to https://nodatime.org/TimeZones");
        client.say(channel, "No timezone set for: " + channel1 + ". !settimezone[SPACE]<Zone ID> - refer to https://nodatime.org/TimeZones");
      }
    }
    return;
  }
}
