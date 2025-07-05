/**
 * Number Facts command
 * 
 * Description: Get number facts on twitch chat
 * 
 * Credits: https://numbersapi.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !numfacts - Random Number facts
 *          !numfacts<SPACE>[number] - Get facts about a specific number
 * 
 *          
 *  
 */

const fetch = require('node-fetch');

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 4; // Max 4 requests per 30 seconds

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

// Input sanitization for number input
function sanitizeNumberInput(input) {
  if (!input || typeof input !== 'string') return null;
  
  // Remove non-numeric characters except negative sign and decimal point
  const cleaned = input.replace(/[^-0-9.]/g, '');
  const parsed = parseInt(cleaned, 10);
  
  // Validate range (-999999 to 999999 for reasonable number facts)
  if (isNaN(parsed) || parsed < -999999 || parsed > 999999) {
    return null;
  }
  
  return parsed;
}

// Fetch number fact with timeout protection
async function getNumberFact(number = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const url = number !== null 
      ? `https://numbersapi.com/${encodeURIComponent(number)}`
      : 'https://numbersapi.com/random';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'accept': 'text/plain', 
        'User-Agent': 'Twitch Bot NumFacts'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.text();
    
    // Basic content validation
    if (!data || data.length > 500) {
      throw new Error('Invalid response format');
    }
    
    return data.trim();
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

exports.numfacts = async function numfacts(client, message, channel, tags) {
  // Clean and split input to handle invisible Unicode characters
  const input = message.trim().split(" ").filter(part => part.trim().length > 0);
  
  if (input[0] !== "!numfacts") {
    return;
  }
  
  // DISABLED: numbersapi.com is currently down
  return;
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before requesting more number facts.`);
    return;
  }
  
  try {
    if (input.length > 2) {
      client.say(channel, `@${tags.username}, usage: !numfacts OR !numfacts [number]`);
      return;
    }
    
    let fact;
    
    if (input.length === 2) {
      // Specific number requested
      const number = sanitizeNumberInput(input[1]);
      if (number === null) {
        client.say(channel, `@${tags.username}, invalid number. Please provide a whole number between -999,999 and 999,999.`);
        return;
      }
      
      fact = await getNumberFact(number);
    } else {
      // Random number fact
      fact = await getNumberFact();
    }
    
    await sleep(1000);
    client.say(channel, `@${tags.username}, ${fact}`);
    
  } catch (error) {
    console.error(`[NUMFACTS] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      input: input[1] ? 'specific number' : 'random'
    });
    
    client.say(channel, `@${tags.username}, sorry, number facts service is temporarily unavailable.`);
  }
};
