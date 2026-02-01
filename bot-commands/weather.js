/**
 * Weather command
 *
 * Description: Get real time weather information on twitch chat
 *
 * Credits: https://openweathermap.org/api
 *
 * Permission required: all users
 *
 * Usage:   !weather<SPACE>[location] - Get weather of searched location
 *
 *
 *
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 60 seconds
const MAX_REQUESTS = 3; // Max 3 requests per minute (weather APIs have rate limits)

// API configuration - using environment variable for security
const API_KEY = process.env.OPENWEATHERMAP_API_KEY;

if (!API_KEY) {
  console.error('[WEATHER] OPENWEATHERMAP_API_KEY environment variable is not set');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load channel configuration
async function loadChannelConfig(channelName) {
  try {
    const configPath = path.join(process.env.BOT_FULL_PATH || '.', 'channel-configs', `${channelName}.json`);
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`[WEATHER] Error loading config for ${channelName}:`, error.message);
    return null;
  }
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

// Input sanitization for location
function sanitizeLocation(location) {
  if (!location || typeof location !== 'string') return '';

  // Allow letters, numbers, spaces, basic punctuation for location names
  const cleaned = location.replace(/[^a-zA-Z0-9\s\-_.,]/g, '').trim();
  return cleaned.substring(0, 100); // Max 100 characters
}

// Fetch weather data with timeout protection
async function fetchWeatherData(location) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${encodeURIComponent(API_KEY)}&units=metric`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'User-Agent': 'Twitch Bot Weather'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Location not found');
      }
      throw new Error(`Weather API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.weather || !data.weather[0] || !data.main || !data.name) {
      throw new Error('Invalid weather data format');
    }

    return {
      location: data.name,
      country: data.sys?.country || '',
      description: data.weather[0].description,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      windSpeed: data.wind?.speed || 0
    };

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

exports.weather = async function weather(client, message, channel, tags) {
  const input = message.split(" ");

  if (input[0] !== "!weather") {
    return;
  }

  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before making more weather requests.`);
    return;
  }

  try {
    if (!API_KEY) {
      client.say(channel, `@${tags.username}, weather service is currently unavailable.`);
      return;
    }

    let locationInput;
    const channelName = channel.startsWith('#') ? channel.substring(1) : channel;

    // Try to sanitize the provided location first
    const providedLocation = input.slice(1).join(" ");
    const sanitizedProvided = sanitizeLocation(providedLocation);

    // If location was provided and is valid after sanitization, use it
    if (sanitizedProvided && sanitizedProvided.length >= 2) {
      locationInput = sanitizedProvided;
    } else {
      // No valid location provided, try to use irl-location from config
      const config = await loadChannelConfig(channelName);

      if (config && config['irl-location']) {
        locationInput = config['irl-location'];
      } else {
        client.say(channel, `@${tags.username}, please enter a location to search for. Usage: !weather [location] OR set default location with !config location set [location]`);
        return;
      }
    }

    // Fetch weather data
    const weatherData = await fetchWeatherData(locationInput);
    await sleep(1000);

    // Format response safely
    const locationName = weatherData.country
      ? `${weatherData.location}, ${weatherData.country}`
      : weatherData.location;

    let weatherMessage = `@${tags.username}, ${locationName}: ${weatherData.description}, ${weatherData.temperature}°C (feels like ${weatherData.feelsLike}°C), humidity ${weatherData.humidity}%`;

    client.say(channel, weatherMessage);

  } catch (error) {
    console.error(`[WEATHER] Error for user ${tags.username}:`, {
      message: error.message,
      location: input.slice(1).join(" "),
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('Location not found')) {
      client.say(channel, `@${tags.username}, location not found. Please check spelling and try again.`);
    } else {
      client.say(channel, `@${tags.username}, sorry, weather service is temporarily unavailable.`);
    }
  }
};