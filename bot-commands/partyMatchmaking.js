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

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 10; // Max 10 matchmaking actions per 30 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Rate limiting check
function checkRateLimit(username) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(username) || [];
  
  // Remove old requests outside the window
  const validRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (validRequests.length >= MAX_REQUESTS) {
    return false; // Rate limited
  }
  
  validRequests.push(now);
  rateLimitMap.set(username, validRequests);
  return true; // Not rate limited
}

// Input validation for team size
function validateTeamSize(size) {
  const parsed = parseInt(size, 10);
  return !isNaN(parsed) && parsed >= 1 && parsed <= 4 ? parsed : null;
}

// Input sanitization for username
function sanitizeUsername(username) {
  if (!username || typeof username !== 'string') return '';
  
  // Remove potentially harmful characters, keep basic Twitch username format
  const cleaned = username.replace(/[^a-zA-Z0-9_@]/g, '').trim();
  return cleaned.substring(0, 25); // Max 25 characters for Twitch usernames
}

const matchmaking_list = new Map();
// Team object
const Team = require(`${process.env.BOT_FULL_PATH}/classes/team.js`);
const Matchmaking = require(`${process.env.BOT_FULL_PATH}/classes/matchmaking.js`);

exports.readMatchmakingFile = async function readMatchmakingFile() {
  try {
    const data = await fs.promises.readFile(`${process.env.BOT_FULL_PATH}/matchmaking.json`, 'utf8');
    const rawMatchmaking = JSON.parse(data);
    for (const details in rawMatchmaking) {
      matchmaking_list.set(details, Object.assign(new Matchmaking(), rawMatchmaking[details]));
    }
  } catch (error) {
    console.error('[MATCHMAKING] Error reading matchmaking file:', {
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

exports.partyMatchmaking = async function partyMatchmaking(client, message, channel, tags) {
  // Set variables for user permission logic
  const badges = tags.badges || {};
  const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
  const isMod = badges.moderator || tags.isMod;
  const isVIP = badges.vip || tags.isVip;
  const isModUp = isBroadcaster || isMod || tags.username === `${process.env.TWITCH_OWNER}`;
  const isVIPUp = isVIP || isModUp;
  const channel1 = channel.substring(1); //channel name (i.e. username)

  const input = message.split(" ");
  
  if (input[0] !== "!mm") {
    return;
  }

  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before making more matchmaking requests.`);
    return;
  }

  try {
    const partyCommand = input[1];
    const partyCommand2 = input[2];
    
    // Function to update mmList into global matchmaking list
    async function updateMmList(mmList) {
      const updMm = matchmaking_list.get(channel1);
      if (updMm) {
        updMm.setMmList(mmList);
        matchmaking_list.set(channel1, updMm);
      }
    }

    // Function to update mmInfo into global matchmaking list
    async function updateMmInfo(mmInfo) {
      const updTeams = matchmaking_list.get(channel1);
      if (updTeams) {
        updTeams.clearTeams();
        updTeams.setTeams(mmInfo);
        matchmaking_list.set(channel1, updTeams);
      }
    }

    // Safe file writing with async/await
    async function writeToMatchmakingFile() {
      try {
        const data = JSON.stringify(Object.fromEntries(matchmaking_list), null, "\t");
        await fs.promises.writeFile(`${process.env.BOT_FULL_PATH}/matchmaking.json`, data, 'utf8');
        console.log('[MATCHMAKING] Data written to file successfully');
      } catch (error) {
        console.error('[MATCHMAKING] Error writing file:', {
          message: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }

    // Moderator commands
    if (isModUp) {
      if (partyCommand === "enable") {
        // Save matchmaking teams data into matchmaking.json
        let mmObject;
        if (matchmaking_list.has(channel1)) {
          mmObject = matchmaking_list.get(channel1);
          if (mmObject.getStatus() === true) {
            client.say(channel, `@${tags.username}, already enabled. Use '!mm disable' to disable matchmaking function.`);
            return;
          } else {
            mmObject.setStatus(true);
            client.say(channel, `@${tags.username}, matchmaking function is now enabled. Send '!mm join' to join matchmaking.`);
          }
        } else {
          mmObject = new Matchmaking(true, [], []);
          client.say(channel, `@${tags.username}, matchmaking function is now enabled. Send '!mm join' to join matchmaking.`);
        }
        matchmaking_list.set(channel1, mmObject);
        await writeToMatchmakingFile();
        return;
      }
      
      if (partyCommand === "disable") {
        if (matchmaking_list.has(channel1)) {
          const mmObject = matchmaking_list.get(channel1);
          if (mmObject.getStatus() === false) {
            client.say(channel, `@${tags.username}, already disabled. Broadcasters can send '!mm enable' to enable matchmaking function.`);
            return;
          } else {
            mmObject.setStatus(false);
            matchmaking_list.set(channel1, mmObject);
          }
        }
        await writeToMatchmakingFile();
        client.say(channel, `@${tags.username}, matchmaking function is now disabled.`);
        return;
      }
      
      if (partyCommand === "clear") {
        if (matchmaking_list.has(channel1)) {
          const clearedMm = Object.assign(new Matchmaking(), matchmaking_list.get(channel1));
          clearedMm.clearMmList();
          clearedMm.clearTeams();
          matchmaking_list.set(channel1, clearedMm);
          await writeToMatchmakingFile();
          client.say(channel, `@${tags.username}, matchmaking list has been cleared.`);
        } else {
          client.say(channel, `@${tags.username}, no matchmaking data to clear.`);
        }
        return;
      }
      
      if (partyCommand === "random") {
        const teamSize = validateTeamSize(partyCommand2);
        if (!teamSize) {
          client.say(channel, `@${tags.username}, invalid team size. Please use 1-4.`);
          return;
        }
        
        if (!matchmaking_list.has(channel1)) {
          client.say(channel, `@${tags.username}, no matchmaking data found.`);
          return;
        }
        
        const randomMm = matchmaking_list.get(channel1);
        const partyTotal = randomMm.mmList.length;
        if (partyTotal === 0) {
          client.say(channel, `@${tags.username}, matchmaking list is empty.`);
          return;
        }
        
        const partyOrder = randomMm.mmList.slice();
        const partyRandom = partyOrder.sort(() => Math.random() - 0.5);
        let countP = 1;
        const randomMmNewTeams = [];
        
        while (partyRandom.length) {
          const partyRandomQ = partyRandom.splice(0, teamSize);
          const teamInfo = new Team(countP, teamSize, partyRandomQ);
          randomMmNewTeams.push(teamInfo);
          client.say(channel, `Team #${teamInfo.number}: ${teamInfo.members.join(', ')}`);
          await sleep(1000);
          countP++;
        }
        
        await updateMmInfo(randomMmNewTeams);
        await sleep(2000);
        await writeToMatchmakingFile();
        return;
      }
      
      if (partyCommand === "info") {
        if (matchmaking_list.has(channel1)) {
          const showTeamsInfo = matchmaking_list.get(channel1).teams;
          if (showTeamsInfo.length > 0) {
            for (let i = 0; i < showTeamsInfo.length; i++) {
              const team = Object.assign(new Team(), showTeamsInfo[i]);
              client.say(channel, `Team #${team.number}: ${team.members.join(', ')}`);
              await sleep(500);
            }
          } else {
            client.say(channel, `@${tags.username}, no teams found.`);
          }
        } else {
          client.say(channel, `@${tags.username}, no matchmaking data found.`);
        }
        return;
      }
    }

    // User commands
    if (input.length > 3) {
      client.say(channel, `@${tags.username}, invalid use of command. Use '!mm' to check current matchmaking list.`);
      return;
    }

    // Check if matchmaking exists and is enabled
    if (!matchmaking_list.has(channel1)) {
      client.say(channel, `@${tags.username}, matchmaking function is not enabled. Broadcasters can send '!mm enable' to enable the matchmaking function.`);
      return;
    }

    const mmObject = matchmaking_list.get(channel1);
    const partyStatus = mmObject.getStatus();
    const partyTotal = mmObject.mmList.length;
    const partyOrder = mmObject.mmList.slice();

    if (!partyStatus) {
      if (input.length === 1) {
        client.say(channel, `@${tags.username}, matchmaking function is not enabled. Broadcasters can send '!mm enable' to enable the matchmaking function.`);
      }
      return;
    }

    // List all players
    if (input.length === 1) {
      if (partyTotal > 0) {
        client.say(channel, `Total: ${partyTotal} players; List: ${partyOrder.join(', ')}`);
      } else {
        client.say(channel, `@${tags.username}, current matchmaking list is empty.`);
      }
      return;
    }

    // Join matchmaking
    if (partyCommand === "join") {
      let addUser = `@${tags.username}`;
      
      // Allow moderators to add other users
      if (isModUp && input.length === 3) {
        addUser = sanitizeUsername(input[2]);
        if (!addUser) {
          client.say(channel, `@${tags.username}, invalid username format.`);
          return;
        }
      }

      if (partyOrder.includes(addUser)) {
        client.say(channel, `@${tags.username}, ${addUser} is already in the matchmaking list. Send '!mm unjoin' to remove from matchmaking.`);
        return;
      }

      // Add user to list
      partyOrder.push(addUser);
      await updateMmList(partyOrder);
      client.say(channel, `@${tags.username}, ${addUser} has joined matchmaking. Send '!mm unjoin' to remove from matchmaking.`);
      await writeToMatchmakingFile();
      return;
    }

    // Leave matchmaking
    if (partyCommand === "unjoin") {
      let removeUser = `@${tags.username}`;
      
      // Allow moderators to remove other users
      if (isModUp && input.length === 3) {
        removeUser = sanitizeUsername(input[2]);
        if (!removeUser) {
          client.say(channel, `@${tags.username}, invalid username format.`);
          return;
        }
      }

      const removeIndex = partyOrder.indexOf(removeUser);
      if (removeIndex === -1) {
        client.say(channel, `@${tags.username}, ${removeUser} is already removed from matchmaking list. Send '!mm join' to join matchmaking.`);
        return;
      }

      // Remove user from list
      partyOrder.splice(removeIndex, 1);
      await updateMmList(partyOrder);
      client.say(channel, `@${tags.username}, ${removeUser} has been removed from matchmaking list. Send '!mm join' to join matchmaking.`);
      await writeToMatchmakingFile();
      return;
    }

  } catch (error) {
    console.error(`[MATCHMAKING] Error for user ${tags.username}:`, {
      message: error.message,
      command: input[0],
      channel: channel1,
      timestamp: new Date().toISOString()
    });
    client.say(channel, `@${tags.username}, sorry, matchmaking service encountered an error.`);
  }
}