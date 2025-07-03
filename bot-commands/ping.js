/**
 * Ping command
 * 
 * Description: Sends a response to the user when they type !ping
 *              Typically used to test if the bot is working
 * 
 * 
 * Permission required: all users
 * 
 * Usage:   !ping
 * 
 *          
 *  
 */

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15000; // 15 seconds
const MAX_REQUESTS = 2; // Max 2 requests per 15 seconds

// Bot start time for uptime calculation
const botStartTime = Date.now();

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

// Format uptime duration
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

exports.ping = async function ping(client, message, channel, tags) {
    const input = message.split(" ");
    
    if (input[0] !== "!ping") {
        return;
    }
    
    // Check rate limiting
    if (!checkRateLimit(tags.username)) {
        return; // Silent rate limiting for ping command
    }
    
    try {
        const startTime = Date.now();
        const uptime = Date.now() - botStartTime;
        const responseTime = Date.now() - startTime;
        
        // Basic pong response with minimal info
        client.say(channel, `@${tags.username}, pong! 🏓 Uptime: ${formatUptime(uptime)}`);
        
    } catch (error) {
        console.error(`[PING] Error for user ${tags.username}:`, {
            message: error.message,
            timestamp: new Date().toISOString()
        });
        
        // Fallback response
        client.say(channel, `@${tags.username}, pong!`);
    }
};