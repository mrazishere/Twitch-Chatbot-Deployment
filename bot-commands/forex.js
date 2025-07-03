/**
 * Currency Exchange command
 * 
 * Description: Currency exchange command in twitch chat
 * 
 * Credits: https://www.exchangerate-api.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !forex [Amount] [FromCurrency] [ToCurrency] - e.g: !forex 100 SGD MYR
 *          !forex [Amount] - Auto-detect base currency from irl-location, convert to USD & SGD
 * 
 *          
 *  
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.API_EXCHANGERATE_API;

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 60 seconds (forex APIs have stricter limits)
const MAX_REQUESTS = 3; // Max 3 requests per minute

// Country to currency mapping
const countryToCurrency = {
  // North America
  'united states': 'USD',
  'usa': 'USD',
  'us': 'USD',
  'america': 'USD',
  'canada': 'CAD',
  'mexico': 'MXN',
  
  // Europe
  'united kingdom': 'GBP',
  'uk': 'GBP',
  'britain': 'GBP',
  'england': 'GBP',
  'scotland': 'GBP',
  'wales': 'GBP',
  'france': 'EUR',
  'germany': 'EUR',
  'italy': 'EUR',
  'spain': 'EUR',
  'netherlands': 'EUR',
  'belgium': 'EUR',
  'austria': 'EUR',
  'portugal': 'EUR',
  'ireland': 'EUR',
  'finland': 'EUR',
  'greece': 'EUR',
  'poland': 'PLN',
  'czech republic': 'CZK',
  'hungary': 'HUF',
  'sweden': 'SEK',
  'norway': 'NOK',
  'denmark': 'DKK',
  'switzerland': 'CHF',
  'russia': 'RUB',
  'ukraine': 'UAH',
  
  // Asia
  'japan': 'JPY',
  'south korea': 'KRW',
  'korea': 'KRW',
  'china': 'CNY',
  'hong kong': 'HKD',
  'singapore': 'SGD',
  'thailand': 'THB',
  'indonesia': 'IDR',
  'philippines': 'PHP',
  'malaysia': 'MYR',
  'taiwan': 'TWD',
  'india': 'INR',
  'pakistan': 'PKR',
  'bangladesh': 'BDT',
  'vietnam': 'VND',
  'uae': 'AED',
  'united arab emirates': 'AED',
  'saudi arabia': 'SAR',
  'israel': 'ILS',
  'turkey': 'TRY',
  
  // Oceania
  'australia': 'AUD',
  'new zealand': 'NZD',
  
  // South America
  'brazil': 'BRL',
  'argentina': 'ARS',
  'chile': 'CLP',
  'colombia': 'COP',
  'peru': 'PEN',
  
  // Africa
  'south africa': 'ZAR',
  'nigeria': 'NGN',
  'egypt': 'EGP',
  'kenya': 'KES',
  'morocco': 'MAD',
  
  // Others
  'iceland': 'ISK',
  'croatia': 'HRK',
  'romania': 'RON',
  'bulgaria': 'BGN'
};

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
    console.error(`[FOREX] Error loading config for ${channelName}:`, error.message);
    return null;
  }
}

// Get currency from country name
function getCurrencyFromCountry(country) {
  if (!country || typeof country !== 'string') return 'USD';
  
  const normalizedCountry = country.toLowerCase().trim();
  return countryToCurrency[normalizedCountry] || 'USD'; // Default to USD if country not found
}

// Input validation
function validateCurrency(currency) {
  if (!currency || typeof currency !== 'string') return '';
  // Currency codes are 3 letters, uppercase
  const cleaned = currency.replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned.length === 3 ? cleaned : '';
}

function validateAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 1000000 ? num : null;
}

// Fetch exchange rate
async function getExchangeRate(fromCurrency, toCurrency, amount) {
  if (!API_KEY) {
    throw new Error('Exchange rate API key not configured');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${fromCurrency}/${toCurrency}/${amount}`,
      {
        method: 'GET',
        headers: { 
          'accept': 'application/json', 
          'content-type': 'application/json',
          'User-Agent': 'Twitch Bot Forex'
        },
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.result !== 'success') {
      throw new Error(data['error-type'] || 'API returned error');
    }
    
    return {
      conversionResult: data.conversion_result,
      rate: data.conversion_rate,
      lastUpdate: data.time_last_update_utc
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

exports.forex = async function forex(client, message, channel, tags) {
  const input = message.split(" ");
  
  if (input[0] !== "!forex") {
    return;
  }
  
  // Check rate limiting
  if (!checkRateLimit(tags.username)) {
    client.say(channel, `@${tags.username}, please wait before making more forex requests (max 3 per minute).`);
    return;
  }
  
  const channelName = channel.startsWith('#') ? channel.substring(1) : channel;
  
  try {
    // Handle different input formats
    if (input.length === 2) {
      // Format: !forex [amount] - Auto-detect base currency from irl-location
      const amount = validateAmount(input[1]);
      if (!amount) {
        client.say(channel, `@${tags.username}, invalid amount. Please provide a number between 1 and 1,000,000.`);
        return;
      }
      
      // Load channel config to get irl-location
      const config = await loadChannelConfig(channelName);
      if (!config || !config['irl-location']) {
        client.say(channel, `@${tags.username}, no location configured for this channel. Use: !forex [amount] [from] [to]`);
        return;
      }
      
      const baseCurrency = getCurrencyFromCountry(config['irl-location']);
      
      // Convert to both USD and SGD (unless base currency is one of them)
      const targetCurrencies = ['USD', 'SGD'].filter(curr => curr !== baseCurrency);
      
      if (targetCurrencies.length === 0) {
        // Base currency is USD or SGD, convert to the other one and EUR
        const targets = baseCurrency === 'USD' ? ['SGD', 'EUR'] : ['USD', 'EUR'];
        targetCurrencies.push(...targets);
      }
      
      const conversions = [];
      for (const targetCurrency of targetCurrencies) {
        try {
          const result = await getExchangeRate(baseCurrency, targetCurrency, amount);
          conversions.push(`${targetCurrency}${result.conversionResult.toFixed(2)}`);
          await sleep(500); // Small delay between API calls
        } catch (error) {
          console.error(`[FOREX] Error converting ${baseCurrency} to ${targetCurrency}:`, error.message);
        }
      }
      
      if (conversions.length > 0) {
        client.say(channel, `@${tags.username}, ${baseCurrency}${amount} = ${conversions.join(', ')}`);
      } else {
        client.say(channel, `@${tags.username}, unable to get exchange rates at this time.`);
      }
      
    } else if (input.length === 4) {
      // Format: !forex [amount] [from] [to] - Traditional format
      const amount = validateAmount(input[1]);
      const fromCurrency = validateCurrency(input[2]);
      const toCurrency = validateCurrency(input[3]);
      
      if (!amount) {
        client.say(channel, `@${tags.username}, invalid amount. Please provide a number between 1 and 1,000,000.`);
        return;
      }
      
      if (!fromCurrency || !toCurrency) {
        client.say(channel, `@${tags.username}, invalid currency codes. Use 3-letter codes like USD, EUR, SGD.`);
        return;
      }
      
      if (fromCurrency === toCurrency) {
        client.say(channel, `@${tags.username}, ${fromCurrency}${amount} = ${toCurrency}${amount} (same currency)`);
        return;
      }
      
      const result = await getExchangeRate(fromCurrency, toCurrency, amount);
      await sleep(1000);
      
      client.say(channel, 
        `@${tags.username}, ${fromCurrency}${amount} = ${toCurrency}${result.conversionResult.toFixed(2)} ` +
        `(Rate: ${result.rate.toFixed(4)})`
      );
      
    } else {
      // Invalid format
      client.say(channel, 
        `@${tags.username}, usage: !forex [amount] OR !forex [amount] [from] [to] ` +
        `(e.g., !forex 100 or !forex 100 USD EUR)`
      );
    }
    
  } catch (error) {
    console.error(`[FOREX] Error for user ${tags.username}:`, {
      message: error.message,
      timestamp: new Date().toISOString(),
      input: input.slice(1).join(' ')
    });
    
    client.say(channel, `@${tags.username}, sorry, currency exchange service is temporarily unavailable.`);
  }
};