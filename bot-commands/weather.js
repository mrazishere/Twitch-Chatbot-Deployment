/**
 * Weather command
 * 
 * Description: Get real time weather information on twitch chat
 * 
 * Credits: https://developer.accuweather.com/apis
 * 
 * Permission required: all users
 * 
 * Usage:   !weather<SPACE>[location] - Get weather of searched location.
 * 
 *          
 *  
 */

const fetch = require('node-fetch');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 60 seconds 
const MAX_REQUESTS = 3; // Max 3 requests per minute (weather APIs have rate limits)

// API configuration - using environment variable for security
const API_KEY = process.env.ACCUWEATHER_API_KEY;

if (!API_KEY) {
  console.error('[WEATHER] ACCUWEATHER_API_KEY environment variable is not set');
}

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

// Input sanitization for location
function sanitizeLocation(location) {
  if (!location || typeof location !== 'string') return '';

  // Allow letters, numbers, spaces, basic punctuation for location names
  const cleaned = location.replace(/[^a-zA-Z0-9\s\-_.,]/g, '').trim();
  return cleaned.substring(0, 100); // Max 100 characters
}

// Fetch location data with timeout protection
async function fetchLocationData(location) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const response = await fetch(
      `https://dataservice.accuweather.com/locations/v1/search?apikey=${encodeURIComponent(API_KEY)}&q=${encodeURIComponent(location)}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'User-Agent': 'Twitch Bot Weather'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Location API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response structure and array bounds
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No locations found');
    }

    const locationData = data[0];
    if (!locationData.Key || !locationData.LocalizedName) {
      throw new Error('Invalid location data format');
    }

    return {
      key: locationData.Key,
      name: locationData.LocalizedName
    };

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fetch weather data with timeout protection
async function fetchWeatherData(locationKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const response = await fetch(
      `https://dataservice.accuweather.com/currentconditions/v1/${encodeURIComponent(locationKey)}?apikey=${encodeURIComponent(API_KEY)}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'User-Agent': 'Twitch Bot Weather'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Weather API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response structure and array bounds
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No weather data found');
    }

    const weatherData = data[0];
    if (!weatherData.WeatherText || !weatherData.Temperature?.Metric?.Value) {
      throw new Error('Invalid weather data format');
    }

    return {
      text: weatherData.WeatherText,
      temperature: weatherData.Temperature.Metric.Value,
      link: weatherData.Link || null
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

    if (!input[1]) {
      client.say(channel, `@${tags.username}, please enter a location to search for. Usage: !weather [location]`);
      return;
    }

    // Sanitize location input
    const locationInput = sanitizeLocation(input.slice(1).join(" "));
    if (!locationInput || locationInput.length < 2) {
      client.say(channel, `@${tags.username}, invalid location. Please provide a valid location name.`);
      return;
    }

    // Fetch location data
    const locationData = await fetchLocationData(locationInput);
    await sleep(500); // Small delay between API calls

    // Fetch weather data
    const weatherData = await fetchWeatherData(locationData.key);
    await sleep(1000);

    // Format response safely
    let weatherMessage = `@${tags.username}, The current weather for ${locationData.name} is ${weatherData.text}, with a temperature of ${weatherData.temperature}°C.`;

    if (weatherData.link) {
      weatherMessage += ` For more information, visit ${weatherData.link}`;
    }

    client.say(channel, weatherMessage);

  } catch (error) {
    console.error(`[WEATHER] Error for user ${tags.username}:`, {
      message: error.message,
      location: input.slice(1).join(" "),
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('No locations found')) {
      client.say(channel, `@${tags.username}, location not found. Please check spelling and try again.`);
    } else {
      client.say(channel, `@${tags.username}, sorry, weather service is temporarily unavailable.`);
    }
  }
};