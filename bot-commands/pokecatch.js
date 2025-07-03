/**
 * Pokemon catch command
 * 
 * Description: Catch pokemons on twitch chat
 * 
 * Credits: https://us-central1-caffs-personal-projects.cloudfunctions.net/pokeselect
 * 
 * Permission required: all users
 * 
 * Usage:   !catch - Catch random pokemons
 * 
 *          
 *  
 */

const fetch = require('node-fetch');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 3; // Max 3 requests per 30 seconds

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

// Fetch Pokemon data with timeout protection
async function fetchPokemon() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const response = await fetch('https://us-central1-caffs-personal-projects.cloudfunctions.net/pokeselect', {
      method: 'GET',
      headers: { 
        'accept': 'text/plain', 
        'content-type': 'text/plain',
        'User-Agent': 'Twitch Bot Pokemon'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.text();
    
    // Validate and clean the response data
    if (!data || typeof data !== 'string' || data.length > 1000) {
      throw new Error('Invalid response format');
    }
    
    // Safely extract Pokemon info before URL
    const urlIndex = data.search(/https?:\/\//);
    const pokemonInfo = urlIndex > 0 ? data.slice(0, urlIndex).trim() : data.trim();
    
    if (!pokemonInfo || pokemonInfo.length < 5) {
      throw new Error('Invalid Pokemon data');
    }
    
    return pokemonInfo;
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

exports.pokecatch = async function pokecatch(client, message, channel, tags) {
  const input = message.split(" ");
  
  if (input[0] !== "!catch") {
    return;
  }
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before catching more Pokemon.`);
    return;
  }
  
  try {
    if (input[1]) {
      client.say(channel, `@${tags.username}, no input required, just use !catch`);
      return;
    }
    
    const pokemonInfo = await fetchPokemon();
    await sleep(1000);
    
    client.say(channel, `@${tags.username}, ${pokemonInfo}`);
    
  } catch (error) {
    console.error(`[POKECATCH] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    
    client.say(channel, `@${tags.username}, sorry, Pokemon catching service is temporarily unavailable.`);
  }
};