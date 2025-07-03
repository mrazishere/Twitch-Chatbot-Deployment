/**
 * Dad Jokes command
 * 
 * Description: Get random dad jokes on twitch chat
 * 
 * Credits: https://icanhazdadjoke.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !dad - Random dad jokes
 *          !dad<SPACE>[SEARCH TERM] - Dad jokes with search term
 * 
 *          
 *  
 */

const fetch = require('node-fetch');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 5; // Max 5 requests per 30 seconds

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

// Input sanitization function
function sanitizeSearchTerm(term) {
  if (!term || typeof term !== 'string') return '';
  // Allow letters, numbers, spaces, basic punctuation for joke searches
  return term.replace(/[^a-zA-Z0-9\s\-_.,!?]/g, '').trim().substring(0, 50);
}

// Fetch random dad joke
async function getRandomJoke() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const response = await fetch('https://icanhazdadjoke.com/', {
      method: 'GET',
      headers: { 
        'accept': 'text/plain', 
        'content-type': 'text/plain',
        'User-Agent': 'Twitch Bot (https://github.com/bot)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const joke = await response.text();
    return joke.trim();
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Search for dad jokes by term
async function searchJokes(searchTerm) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const response = await fetch(`https://icanhazdadjoke.com/search?term=${encodeURIComponent(searchTerm)}`, {
      method: 'GET',
      headers: { 
        'accept': 'application/json', 
        'content-type': 'application/json',
        'User-Agent': 'Twitch Bot (https://github.com/bot)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

exports.dad = async function dad(client, message, channel, tags) {
  const input = message.split(" ");
  
  if (input[0] !== "!dad") {
    return;
  }
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before requesting more dad jokes.`);
    return;
  }
  
  try {
    if (!input[1]) {
      // Get random joke
      const joke = await getRandomJoke();
      await sleep(1000);
      client.say(channel, `@${tags.username}, ${joke}`);
      
    } else {
      // Search for jokes with term
      const searchTerm = sanitizeSearchTerm(input[1]);
      if (!searchTerm) {
        client.say(channel, `@${tags.username}, invalid search term provided.`);
        return;
      }
      
      const data = await searchJokes(searchTerm);
      await sleep(1000);
      
      if (!data.results || data.results.length === 0) {
        client.say(channel, `@${tags.username}, sorry, nothing found with the search term: ${searchTerm}`);
      } else {
        const randomIndex = Math.floor(Math.random() * data.results.length);
        const joke = data.results[randomIndex].joke;
        client.say(channel, `@${tags.username}, ${joke}`);
      }
    }
    
  } catch (error) {
    console.error(`[DAD] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      searchTerm: input[1] ? sanitizeSearchTerm(input[1]) : 'none'
    });
    
    client.say(channel, `@${tags.username}, sorry, dad jokes service is temporarily unavailable.`);
  }
};