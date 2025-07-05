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

// Input sanitization for timezone
function sanitizeTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return '';
  // Allow letters, numbers, slash, underscore, hyphen for timezone format
  return timezone.replace(/[^a-zA-Z0-9/_-]/g, '').trim().substring(0, 50);
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

// Save channel configuration
async function saveChannelConfig(channelName, config) {
  try {
    const configPath = path.join(process.env.BOT_FULL_PATH || '.', 'channel-configs', `${channelName}.json`);
    config.lastUpdated = new Date().toISOString();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`[CLOCK] Error saving config for ${channelName}:`, {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

// List of common valid timezones as fallback
const validTimezones = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Prague', 'Europe/Warsaw',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Kuala_Lumpur', 'Asia/Taipei',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tehran', 'Asia/Jerusalem',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane',
  'Pacific/Auckland', 'Pacific/Honolulu', 'Pacific/Fiji',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
  'UTC', 'GMT'
];

// Country to timezone mapping for auto-detection
const countryToTimezone = {
  // North America
  'united states': 'America/New_York',
  'usa': 'America/New_York',
  'us': 'America/New_York',
  'america': 'America/New_York',
  'canada': 'America/Toronto',
  'mexico': 'America/Mexico_City',

  // Europe
  'united kingdom': 'Europe/London',
  'uk': 'Europe/London',
  'britain': 'Europe/London',
  'england': 'Europe/London',
  'scotland': 'Europe/London',
  'wales': 'Europe/London',
  'france': 'Europe/Paris',
  'germany': 'Europe/Berlin',
  'italy': 'Europe/Rome',
  'spain': 'Europe/Madrid',
  'netherlands': 'Europe/Amsterdam',
  'belgium': 'Europe/Brussels',
  'austria': 'Europe/Vienna',
  'portugal': 'Europe/Paris',
  'ireland': 'Europe/London',
  'finland': 'Europe/Paris',
  'greece': 'Europe/Paris',
  'poland': 'Europe/Warsaw',
  'czech republic': 'Europe/Prague',
  'sweden': 'Europe/Paris',
  'norway': 'Europe/Paris',
  'denmark': 'Europe/Paris',
  'switzerland': 'Europe/Paris',
  'russia': 'Europe/Moscow',

  // Asia
  'japan': 'Asia/Tokyo',
  'south korea': 'Asia/Seoul',
  'korea': 'Asia/Seoul',
  'china': 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  'singapore': 'Asia/Singapore',
  'thailand': 'Asia/Bangkok',
  'indonesia': 'Asia/Jakarta',
  'philippines': 'Asia/Manila',
  'malaysia': 'Asia/Kuala_Lumpur',
  'taiwan': 'Asia/Taipei',
  'india': 'Asia/Kolkata',
  'pakistan': 'Asia/Kolkata',
  'bangladesh': 'Asia/Kolkata',
  'vietnam': 'Asia/Bangkok',
  'uae': 'Asia/Dubai',
  'united arab emirates': 'Asia/Dubai',
  'saudi arabia': 'Asia/Riyadh',
  'israel': 'Asia/Jerusalem',
  'turkey': 'Europe/Istanbul',

  // Oceania
  'australia': 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland',

  // South America
  'brazil': 'America/Sao_Paulo',
  'argentina': 'America/Argentina/Buenos_Aires',
  'chile': 'America/Santiago',
  'colombia': 'America/Bogota',
  'peru': 'America/Lima',

  // Africa
  'south africa': 'Africa/Johannesburg',
  'nigeria': 'Africa/Lagos',
  'egypt': 'Africa/Cairo',
  'kenya': 'Africa/Nairobi',
  'morocco': 'Africa/Casablanca'
};

// Get timezone from country name
function getTimezoneFromCountry(country) {
  if (!country || typeof country !== 'string') return null;

  const normalizedCountry = country.toLowerCase().trim();
  return countryToTimezone[normalizedCountry] || null;
}

// Validate timezone with API (with fallback to local validation)
async function validateTimezone(timezone) {
  // First check against known valid timezones
  if (validTimezones.includes(timezone)) {
    console.log(`[CLOCK] Timezone ${timezone} validated locally (known valid)`);
    return true;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

    const response = await fetch(`https://www.timeapi.io/api/TimeZone/zone?timeZone=${encodeURIComponent(timezone)}`, {
      method: 'GET',
      headers: { 'accept': 'application/json', 'content-type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log(`[CLOCK] Timezone API validation for ${timezone}: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`[CLOCK] Timezone API validation error:`, {
      message: error.message,
      timezone: timezone,
      timestamp: new Date().toISOString()
    });

    // If API fails, do a basic format check as fallback
    const isValidFormat = /^[A-Za-z]+\/[A-Za-z_]+$/.test(timezone) || timezone === 'UTC' || timezone === 'GMT';
    console.log(`[CLOCK] Fallback validation for ${timezone}: ${isValidFormat}`);
    return isValidFormat;
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
  if (input[0] !== "!clock" && input[0] !== "!settimezone") {
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
    if (input[0] === "!settimezone") {
      // Set timezone command - moderators only
      if (!isModUp) {
        client.say(channel, `@${tags.username}, !settimezone is for Moderators & above.`);
        return;
      }

      // Filter out empty strings and special characters that might be causing parsing issues
      const filteredInput = input.filter(part => part.trim().length > 0 && !/[\u{E0000}-\u{E007F}]/u.test(part));

      let requestedTimezone = null;

      if (filteredInput.length === 1) {
        // No timezone provided - try to auto-detect from irl-location
        const config = await loadChannelConfig(channelName);
        if (config && config['irl-location']) {
          const autoTimezone = getTimezoneFromCountry(config['irl-location']);
          if (autoTimezone) {
            requestedTimezone = autoTimezone;
            console.log(`[CLOCK] Auto-detected timezone ${autoTimezone} from location: ${config['irl-location']}`);
          } else {
            client.say(channel, `@${tags.username}, could not auto-detect timezone from location "${config['irl-location']}". Please specify timezone manually: !settimezone [Zone ID] - refer to https://nodatime.org/TimeZones`);
            return;
          }
        } else {
          client.say(channel, `@${tags.username}, no location configured. Use !config location set [country] first, or specify timezone manually: !settimezone [Zone ID] - refer to https://nodatime.org/TimeZones`);
          return;
        }
      } else if (filteredInput.length === 2) {
        // Manual timezone provided
        requestedTimezone = sanitizeTimezone(filteredInput[1]);
      } else {
        client.say(channel, `@${tags.username}, usage: !settimezone (auto-detect from location) OR !settimezone [Zone ID] - refer to https://nodatime.org/TimeZones`);
        return;
      }
      if (!requestedTimezone) {
        client.say(channel, `@${tags.username}, invalid timezone format provided.`);
        return;
      }

      // Validate timezone with API
      const isValidTimezone = await validateTimezone(requestedTimezone);
      if (!isValidTimezone) {
        client.say(channel, `@${tags.username}, invalid Zone ID! Make sure you enter valid Zone ID per https://nodatime.org/TimeZones`);
        return;
      }

      // Load and update channel config
      const config = await loadChannelConfig(channelName);
      if (!config) {
        client.say(channel, `@${tags.username}, error loading channel configuration.`);
        return;
      }

      config.timezone = requestedTimezone;
      const success = await saveChannelConfig(channelName, config);

      if (success) {
        await sleep(1000);
        client.say(channel, `Timezone for ${channelName} successfully set to ${requestedTimezone}. Use !clock to display current local time.`);
      } else {
        client.say(channel, `@${tags.username}, error saving timezone configuration.`);
      }

    } else if (input[0] === "!clock") {
      // Display clock command - all users
      if (input.length !== 1) {
        client.say(channel, `@${tags.username}, this command does not accept any input, just enter !clock to get ${channel}'s local time.`);
        return;
      }

      // Load channel config
      const config = await loadChannelConfig(channelName);
      if (!config || !config.timezone) {
        client.say(channel, `No timezone set for: ${channelName}. Use !settimezone [Zone ID] - refer to https://nodatime.org/TimeZones`);
        return;
      }

      // Get current time
      const timeData = await getCurrentTime(config.timezone);
      if (!timeData) {
        client.say(channel, `@${tags.username}, sorry, time service is temporarily unavailable.`);
        return;
      }

      const locationParts = timeData.timeZone.split("/");
      const location = locationParts[locationParts.length - 1];

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