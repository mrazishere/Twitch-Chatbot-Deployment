/**
 * Random advice command
 * 
 * Description: Get advice on twitch chat
 * 
 * Credits: https://adviceslip.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !advice - Random advice
 *          !advice<SPACE>[SEARCH TERM] - Advice with search term
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 3; // Max 3 requests per 30 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Input sanitization function
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().substring(0, 50);
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

exports.advice = async function advice(client, message, channel, tags) {
  const input = message.split(" ");
  if (input[0] !== "!advice") {
    return;
  }
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before requesting more advice.`);
    return;
  }
  
  try {
    let apiUrl = 'https://api.adviceslip.com/advice';
    let searchTerm = '';
    
    if (input[1]) {
      searchTerm = sanitizeInput(input[1]);
      if (!searchTerm) {
        client.say(channel, `@${tags.username}, invalid search term provided.`);
        return;
      }
      apiUrl = `https://api.adviceslip.com/advice/search/${encodeURIComponent(searchTerm)}`;
    }
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      timeout: 5000 // 5 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    await sleep(1000);
    
    if (!input[1]) {
      // Random advice
      if (data.slip && data.slip.advice) {
        client.say(channel, `@${tags.username}, ${data.slip.advice}`);
      } else {
        client.say(channel, `@${tags.username}, sorry, no advice available right now.`);
      }
    } else {
      // Search advice
      if (data.slips && data.slips.length > 0) {
        const randomIndex = Math.floor(Math.random() * data.slips.length);
        const advice = data.slips[randomIndex].advice;
        client.say(channel, `@${tags.username}, ${advice}`);
      } else {
        client.say(channel, `@${tags.username}, sorry, nothing found for search term: ${searchTerm}`);
      }
    }
    
  } catch (error) {
    console.error(`[ADVICE] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      searchTerm: input[1] ? sanitizeInput(input[1]) : 'none'
    });
    
    client.say(channel, `@${tags.username}, sorry, advice service is temporarily unavailable.`);
  }
};