/**
 * Clock command
 *
 * Description: Display current time based on the timezone from channel config
 *
 * Credits: https://www.timeapi.io/
 *
 * Permission required: all users
 *
 * Usage:   !clock - See time based on Streamer's timezone
 *          Set timezone via: !config location set [location]
 *
 *
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 5; // Max 5 requests per 30 seconds (higher for timezone commands)

// Sleep function
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


// Load channel configuration
async function loadChannelConfig(channelName) {
  try {
    const configPath = path.join(process.env.BOT_FULL_PATH || '.', 'channel-configs', `${channelName}.json`);
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`[CLOCK] Error loading config for ${channelName}:`, {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}



// Get current time for timezone
async function getCurrentTime(timezone) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased to 10 seconds

    const response = await fetch(`https://www.timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(timezone)}`, {
      method: 'GET',
      headers: { 'accept': 'application/json', 'content-type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      date: data.date,
      time: data.time,
      timeZone: data.timeZone,
      dayOfWeek: data.dayOfWeek
    };
  } catch (error) {
    console.error(`[CLOCK] Time fetch error, trying fallback:`, {
      message: error.message,
      timezone: timezone,
      timestamp: new Date().toISOString()
    });

    // Fallback: Use JavaScript's built-in date with timezone
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
        hour12: false
      });

      const parts = formatter.formatToParts(now);
      const partsObj = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});

      return {
        date: `${partsObj.year}-${partsObj.month}-${partsObj.day}`,
        time: `${partsObj.hour}:${partsObj.minute}:${partsObj.second}`,
        timeZone: timezone,
        dayOfWeek: partsObj.weekday
      };
    } catch (fallbackError) {
      console.error(`[CLOCK] Fallback also failed:`, {
        message: fallbackError.message,
        timezone: timezone,
        timestamp: new Date().toISOString()
      });
      return null;
    }
  }
}

exports.clock = async function clock(client, message, channel, tags) {
  // Simple approach: just handle the specific invisible character issue
  const input = message.trim().split(/\s+/).filter(part => {
    // Filter out parts that are only invisible/control characters
    return part.replace(/[\u200B-\u200D\uFEFF\u00A0\uE0000-\uE007F]/g, '').length > 0;
  });

  // DEBUG: Log the input processing
  //console.log(`[CLOCK] DEBUG - Original message: "${message}"`);
  //console.log(`[CLOCK] DEBUG - Processed input: [${input.map(p => `"${p}"`).join(', ')}]`);
  //console.log(`[CLOCK] DEBUG - Input length: ${input.length}`);

  // Check if this is actually a clock command FIRST
  if (input[0] !== "!clock") {
    return; // Not our command, exit immediately
  }

  // Set variables for user permission logic
  const badges = tags.badges || {};
  const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
  const isMod = badges.moderator || tags.isMod;
  const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
  const channelName = channel.startsWith('#') ? channel.substring(1) : channel; // Remove # from channel name

  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before using clock commands again.`);
    return;
  }

  try {
    if (input[0] === "!clock") {
      // Display clock command - all users
      if (input.length !== 1) {
        client.say(channel, `@${tags.username}, this command does not accept any input, just enter !clock to get ${channel}'s local time.`);
        return;
      }

      // Load channel config
      const config = await loadChannelConfig(channelName);
      if (!config || !config.timezone) {
        client.say(channel, `No timezone set for: ${channelName}. Use !config location set [location] to set your location and timezone automatically.`);
        return;
      }

      // Get current time
      const timeData = await getCurrentTime(config.timezone);
      if (!timeData) {
        client.say(channel, `@${tags.username}, sorry, time service is temporarily unavailable.`);
        return;
      }

      // Use irl-location if set, otherwise extract from timezone
      let location;
      if (config['irl-location']) {
        // Capitalize first letter of each word
        location = config['irl-location']
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      } else {
        const locationParts = timeData.timeZone.split("/");
        location = locationParts[locationParts.length - 1];
      }

      await sleep(1000);
      client.say(channel, `The current time in ${location} is ${timeData.time} - ${timeData.dayOfWeek}, ${timeData.date}`);
    }

  } catch (error) {
    console.error(`[CLOCK] Error for user ${tags.username}:`, {
      message: error.message,
      command: input[0],
      timestamp: new Date().toISOString()
    });

    client.say(channel, `@${tags.username}, sorry, clock service is temporarily unavailable.`);
  }
};