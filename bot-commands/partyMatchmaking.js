/**
 * Play with viewers random matchmaking command
 * 
 * Description: Allows viewers to play with each other and get matched with random viewers as a team
 *              Streamer can set the size of the teams and randomize the team members
 * 
 * Credits: twitch.tv/raaiined
 * 
 * Permission required:
 *          !mm: All users
 *          !mm enable: Moderators and above
 *          !mm disable: Moderators and above
 *          !mm clear: Moderators and above
 *          !mm random: Moderators and above
 *          !mm info: Moderators and above
 *          !mm join: All users
 *          !mm unjoin: All users
 * 
 * Usage:   !mm - List all players in the matchmaking list
 *          !mm join - Add yourself to the matchmaking list
 *          !mm unjoin - Remove yourself from the matchmaking list
 *          !mm enable - Enable matchmaking feature
 *          !mm disable - Disable matchmaking feature
 *          !mm clear - Clear matchmaking list
 *          !mm random <1-4> - Randomize the matchmaking list into teams of the specified size
 *          !mm info - List all teams and their members
 * 
 *          
 *  
 */

const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var matchmaking_list = new Map();
// Team object
const Team = require(`${process.env.BOT_FULL_PATH}/classes/team.js`);
const Matchmaking = require(`${process.env.BOT_FULL_PATH}/classes/matchmaking.js`);

exports.readMatchmakingFile = async function readMatchmakingFile() {
  try {
    const data = await fs.promises.readFile(`${process.env.BOT_FULL_PATH}/matchmaking.json`, 'utf8');
    const rawMatchmaking = JSON.parse(data);
    for (var details in rawMatchmaking) {
      matchmaking_list.set(details, Object.assign(new Matchmaking(), rawMatchmaking[details]));
    }
  } catch (error) {
    console.error(error);
  }
}

exports.partyMatchmaking = async function partyMatchmaking(client, message, channel, tags) {
  // Set variables for user permission logic
  const badges = tags.badges || {};
  const isBroadcaster = badges.broadcaster;
  const isMod = badges.moderator;
  const isVIP = badges.vip;
  const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
  const isVIPUp = isVIP || isModUp;
  const channel1 = channel.substring(1); //channel name (i.e. username)

  input = message.split(" ");
  if (input[0] === "!mm") {
    var partyCommand = input[1];
    var partyCommand2 = input[2];
    // Function to update mmList into global matchmaking list
    // Update as at 13 July 2022 by Rained
    async function updateMmList(mmList) {
      updMm = matchmaking_list.get(channel1);
      updMm.setMmList(mmList);
      matchmaking_list.set(channel1, updMm);
    }

    // Function to update mmInfo into global matchmaking list
    // Update as at 13 July 2022 by Rained
    async function updateMmInfo(mmInfo) {
      updTeams = matchmaking_list.get(channel1);
      updTeams.clearTeams();
      updTeams.setTeams(mmInfo);
      matchmaking_list.set(channel1, updTeams);
    }

    async function writeToMatchmakingFile() {
      const data = JSON.stringify(Object.fromEntries(matchmaking_list), null, "\t");
      fs.writeFile(`${process.env.BOT_FULL_PATH}/matchmaking.json`, data, (err) => {
        if (err) {
          throw err;
        }
        console.log("Matchmaking JSON data is updated and written to file.");
      });
    }

    if (isModUp) {
      if (partyCommand == "enable") {
        // Save matchmaking teams data into matchmaking.json
        // Update as at 13 July 2022 by Rained/MrAz
        if (matchmaking_list.has(channel1)) { //Foolproof checks to retrieve existing object and change status to true
          mmObject = matchmaking_list.get(channel1);
          if (mmObject.getStatus() == true) {
            client.say(channel, "Already enabled, '!mm disable' to disable matchmaking function");
            return;
          } else {
            mmObject.setStatus(true);
            client.say(channel, "Matchmaking function is now enabled. Send '!mm join' to join matchmaking.");
          }
        } else { //This should only be run once AFTER the user uses !mm enable FOR THE VERY FIRST TIME
          mmObject = new Matchmaking(true, [], []);
          client.say(channel, "Matchmaking function is now enabled. Send '!mm join' to join matchmaking.");
        }
        matchmaking_list.set(channel1, mmObject);
        writeToMatchmakingFile();

      }
      if (partyCommand == "disable") {
        if (matchmaking_list.has(channel1)) { //Foolproof checks to retrieve existing object and change status to true
          mmObject = matchmaking_list.get(channel1);
          if (mmObject.getStatus() == false) {
            client.say(channel, "Already disabled, Broadcasters can send '!mm enable' to enable matchmaking function");
            return;
          } else {
            mmObject.setStatus(false);
          }
        }
        matchmaking_list.set(channel1, mmObject);
        writeToMatchmakingFile();
        client.say(channel, "Matchmaking function is now disabled. Broadcasters can send '!mm enable' to enable the matchmaking function.");
        return;

      }
      if (partyCommand == "clear") {
        clearedMm = Object.assign(new Matchmaking(), matchmaking_list.get(channel1));
        clearedMm.clearMmList();
        clearedMm.clearTeams();
        matchmaking_list.set(channel1, clearedMm);
        writeToMatchmakingFile();
        client.say(channel, "Matchmaking list has been cleared.");
        return;
      }
      if (partyCommand == "random" && !isNaN(partyCommand2) && partyCommand2 <= 4) {
        randomMm = matchmaking_list.get(channel1);
        var partyTotal = randomMm.mmList.length;
        var partyOrder = randomMm.mmList.slice();
        var partyRandom = partyOrder.sort(() => Math.random() - 0.5);
        var countP = 1;
        randomMmNewTeams = [];
        while (partyRandom.length) {
          var partyRandomQ = partyRandom.splice(0, partyCommand2);
          var teamInfo = new Team(countP, partyCommand2, partyRandomQ);
          randomMmNewTeams.push(teamInfo);
          client.say(channel, "Team #" + teamInfo.number + ": " + teamInfo.members);
          sleep(1000);
          countP++;
        }
        console.log("JSON BEFORE CALLING ANYTHING: " + JSON.stringify(Object.fromEntries(matchmaking_list)));
        // Update as at 13 July 2022 by Rained
        updateMmInfo(randomMmNewTeams);
        sleep(5000);
        writeToMatchmakingFile();
        return;
      }
      if (partyCommand == "info") {
        if (matchmaking_list.has(channel1)) {
          showTeamsInfo = matchmaking_list.get(channel1).teams;
          if (showTeamsInfo.length > 0) {
            for (i = 0; i < showTeamsInfo.length; i++) {
              showTeamsInfo[i] = Object.assign(new Team(), showTeamsInfo[i]);
              client.say(channel, "Team #" + showTeamsInfo[i].number + ": " + showTeamsInfo[i].members);
            }
            console.log(showTeamsInfo);
          }
        }
      }
    }

    if (input.length > 3) {
      client.say(channel, `@${tags.username}, Invalid use of command, '!mm' to check current matchmaking list`);
      return;
    } else {
      /* JSON TEST START */
      if (matchmaking_list.has(channel1)) {
        mmObject = matchmaking_list.get(channel1);
        var partyStatus = mmObject.getStatus();
        var partyTotal = mmObject.mmList.length;
        var partyOrder = mmObject.mmList.slice();
        if (partyStatus == true) {
          if (input.length == 1) {
            if (partyTotal > 0) {
              client.say(channel, "Total: " + partyTotal + " players; List: " + partyOrder);
              return;
            } else {
              client.say(channel, "Current matchmaking list is empty.");
              return;
            }
          } else {
            if (partyCommand == "join") {
              var addUser = `@${tags.username}`;
              if (isModUp && input.length == 3) {
                addUser = input[2].toLowerCase();
              }
              if (partyOrder.includes(addUser)) {
                client.say(channel, addUser + " is already in the matchmaking list. Send '!mm unjoin' to remove from matchmaking.");
                return;
              } else {
                existingTeamsInfo = mmObject.teams.slice();
                //If teams info of channel exists, check if possible to join existing team, and if not possible, create new team for user
                if (existingTeamsInfo.length > 0) {
                  var added = false; //Flag to check if user has been successfully added into a team
                  for (var i = 0; i < existingTeamsInfo.length; i++) {
                    if (existingTeamsInfo[i].members.length < existingTeamsInfo[i].size) { //Check if team's array size is lesser than allocated size
                      existingTeamsInfo[i].members.push(addUser); //Add user to team
                      added = true;
                      break; //Force exit for-loop when this is completed
                    }
                  }
                  if (added == false) { //If user not successfully added to existing team, create new team
                    var newTeamMembers = [];
                    newTeamMembers.push(addUser);
                    let newTeamInfo = new Team(existingTeamsInfo.length + 1, existingTeamsInfo[0].size, newTeamMembers);
                    existingTeamsInfo.push(newTeamInfo);
                  }
                }

                // Update as at 13 July 2022 by Rained
                partyOrder.push(addUser);
                updateMmList(partyOrder);
                client.say(channel, addUser + " has joined matchmaking. Send '!mm unjoin' to remove from matchmaking.");
                updateMmInfo(existingTeamsInfo);
                writeToMatchmakingFile();
              }
            }
            if (partyCommand == "unjoin") {
              var removeUser = `@${tags.username}`;
              if (isModUp && input.length == 3) {
                removeUser = input[2].toLowerCase();
              }
              if (partyOrder.includes(removeUser)) {
                //Remove user from existing teams info of channel
                unjoinedTeamsInfo = matchmaking_list.get(channel1).teams.slice();
                for (var i = 0; i < unjoinedTeamsInfo.length; i++) {
                  if (unjoinedTeamsInfo[i].members.includes(removeUser)) {
                    var index = unjoinedTeamsInfo[i].members.indexOf(removeUser); //Retrieve array index of user to be removed
                    unjoinedTeamsInfo[i].members.splice(index, 1); //Remove user at the index, 1 occurrence
                    break; //Force exit for-loop when this is completed
                  }
                }

                removeIndex = partyOrder.indexOf(removeUser);
                if (removeIndex > -1) {
                  partyOrder.splice(removeIndex, 1);
                }
                updateMmList(partyOrder);
                client.say(channel, removeUser + " has been removed from matchmaking list. Send '!mm join' to join matchmaking.");

                //Check if teams can be merged; require double for-loops
                for (var i = 0; i < unjoinedTeamsInfo.length; i++) {
                  unjoinedTeamsInfo[i].number = i + 1;
                  //Check if first team to use as comparison is not full; recursively check after merging
                  while (unjoinedTeamsInfo[i].members.length < unjoinedTeamsInfo[i].size) {
                    var j = 0;
                    for (j = 0; j < unjoinedTeamsInfo.length; j++) {
                      //Check THREE conditions
                      //- If second team is also not full
                      //- If second team is not first team
                      //- If sum of lengths of arrays of first and second team are less than or equal to fixed size
                      if ((unjoinedTeamsInfo[j].members.length < unjoinedTeamsInfo[j].size) && (j != i) && (unjoinedTeamsInfo[i].members.length + unjoinedTeamsInfo[j].members.length <= unjoinedTeamsInfo[i].size)) {
                        //Execute team merging
                        //Concat members of second team into first team
                        unjoinedTeamsInfo[i].members = unjoinedTeamsInfo[i].members.concat(unjoinedTeamsInfo[j].members);
                        //Destroy second team
                        unjoinedTeamsInfo.splice(j, 1);
                        //Restart loop
                        j = 0
                      }
                    }
                    //Force break if teams are unmergable with compared
                    if (j != 0) break;
                  }

                  //Foolproof check to delete empty teams (idk why got empty teams leymao)
                  if (unjoinedTeamsInfo[i].members.length == 0) {
                    unjoinedTeamsInfo.splice(i, 1);
                  }
                }

                //Update if mmInfo exists (i.e. player unjoined after random has been called)
                // Update as at 13 July 2022 by Rained
                if (unjoinedTeamsInfo.length > 0)
                  updateMmInfo(unjoinedTeamsInfo);

              } else {
                client.say(channel, removeUser + " is already removed from matchmaking list. Send '!mm join' to join matchmaking.");
                return;
              }
              writeToMatchmakingFile();
            }
          }
        } else if (input.length == 1) {
          client.say(channel, "Matchmaking function is not enabled. Broadcasters can send '!mm enable' to enable the matchmaking function.");
          return;
        }
      } else {
        client.say(channel, "Matchmaking function is not enabled. Broadcasters can send '!mm enable' to enable the matchmaking function.");
        return;
      }
      return;
    }
  }
}