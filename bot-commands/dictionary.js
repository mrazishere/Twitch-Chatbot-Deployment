/**
 * Dictionary command
 * 
 * Description: Get word definitions on twitch chat
 * 
 * Credits: https://dictionaryapi.dev/
 * 
 * Permission required: all users
 * 
 * Usage:   !define<SPACE>[SEARCH TERM] - Get definition of search term
 *          
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
function sanitizeWord(word) {
  if (!word || typeof word !== 'string') return '';
  // Only allow letters and basic punctuation for dictionary words
  return word.replace(/[^a-zA-Z'-]/g, '').toLowerCase().trim().substring(0, 30);
}

// Fetch word definition
async function getDefinition(word) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
  
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      method: 'GET',
      headers: { 
        'accept': 'application/json', 
        'content-type': 'application/json',
        'User-Agent': 'Twitch Bot Dictionary Lookup'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { notFound: true };
      }
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    return { data };
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Extract definition from API response with safe array access
function extractDefinition(data) {
  try {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    
    const entry = data[0];
    if (!entry.meanings || !Array.isArray(entry.meanings) || entry.meanings.length === 0) {
      return null;
    }
    
    const meaning = entry.meanings[0];
    if (!meaning.definitions || !Array.isArray(meaning.definitions) || meaning.definitions.length === 0) {
      return null;
    }
    
    // Get the first definition (most common)
    const definition = meaning.definitions[0];
    if (!definition.definition) {
      return null;
    }
    
    // Include part of speech if available
    const partOfSpeech = meaning.partOfSpeech ? `(${meaning.partOfSpeech}) ` : '';
    
    return {
      word: entry.word || '',
      partOfSpeech: partOfSpeech,
      definition: definition.definition.trim(),
      example: definition.example ? definition.example.trim() : null
    };
    
  } catch (error) {
    console.error('[DICTIONARY] Error extracting definition:', error.message);
    return null;
  }
}

exports.dictionary = async function dictionary(client, message, channel, tags) {
  const input = message.split(" ");
  
  if (input[0] !== "!define") {
    return;
  }
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before requesting more definitions.`);
    return;
  }
  
  // Validate input
  if (!input[1]) {
    client.say(channel, `@${tags.username}, please provide a word to define. Usage: !define [word]`);
    return;
  }
  
  if (input.length > 2) {
    client.say(channel, `@${tags.username}, please provide only one word to define.`);
    return;
  }
  
  const word = sanitizeWord(input[1]);
  if (!word || word.length < 2) {
    client.say(channel, `@${tags.username}, invalid word provided. Please use letters only.`);
    return;
  }
  
  try {
    const result = await getDefinition(word);
    await sleep(1000);
    
    if (result.notFound) {
      client.say(channel, `@${tags.username}, sorry, no definition found for: ${word}`);
      return;
    }
    
    const definition = extractDefinition(result.data);
    if (!definition) {
      client.say(channel, `@${tags.username}, sorry, unable to parse definition for: ${word}`);
      return;
    }
    
    // Format response (keep it concise for Twitch chat)
    let response = `@${tags.username}, ${definition.word}: ${definition.partOfSpeech}${definition.definition}`;
    
    // Truncate if too long for Twitch (max 500 chars)
    if (response.length > 400) {
      response = response.substring(0, 397) + '...';
    }
    
    client.say(channel, response);
    
  } catch (error) {
    console.error(`[DICTIONARY] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      word: word
    });
    
    client.say(channel, `@${tags.username}, sorry, dictionary service is temporarily unavailable.`);
  }
};