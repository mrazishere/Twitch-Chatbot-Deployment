/**
 * Twitch chat countdown command
 * 
 * Description: Allows streamers to start and cancel a countdown in the channel's chat.
 *              Some use purposes include: Snipe games.
 *              In order for the countdown to work, the bot needs to be at least a VIP or above due to Twitch's chat cooldown.
 * 
 * Permission required: Special Users, Moderators and above
 * 
 * Usage:
 *   !snipecd - Start countdown in 10 seconds
 *   !snipecd [number of seconds] - Start countdown in 'n' seconds
 *   !cancelcd - Cancel the ongoing countdown
 */

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 60 seconds
const MAX_REQUESTS = 2; // Max 2 countdown requests per minute

// Countdown state management
let countdownInterval = null;
let countdownChannel = null;
let countdownStartTime = null;

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

// Input validation for countdown duration
function validateCountdownDuration(duration) {
    const parsed = parseInt(duration, 10);
    
    // Validate range: minimum 5 seconds, maximum 300 seconds (5 minutes)
    if (isNaN(parsed) || parsed < 5 || parsed > 300) {
        return null;
    }
    
    return parsed;
}

// Safe interval cleanup
function clearCountdownInterval() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        countdownChannel = null;
        countdownStartTime = null;
    }
}

exports.snipecd = async function snipecd(client, message, channel, tags) {
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
    const isMod = badges.moderator || tags.isMod;
    const isVIP = badges.vip || tags.isVip;
    const isSpecialUser = tags.isSpecialUser || false;
    const isModUp = tags.isModUp || isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = tags.isVIPUp || isVIP || isModUp;
    const isSpecialUp = isSpecialUser || isVIPUp;
    const input = message.trimEnd().split(" ");

    try {
        if (input[0] === "!snipecd") {
            if (!isSpecialUp) {
                client.say(channel, `@${tags.username}, !snipecd is for Special Users & above.`);
                return;
            }

            // Check rate limiting
            if (!checkRateLimit(tags.username)) {
                client.say(channel, `@${tags.username}, please wait before starting another countdown.`);
                return;
            }

            if (countdownInterval) {
                client.say(channel, `@${tags.username}, there's already an ongoing countdown. Use !cancelcd to cancel it.`);
                return;
            }

            let cd = 10; // Default countdown duration
            
            if (input.length === 2) {
                const validatedDuration = validateCountdownDuration(input[1]);
                if (validatedDuration === null) {
                    client.say(channel, `@${tags.username}, invalid duration. Please use 5-300 seconds.`);
                    return;
                }
                cd = validatedDuration;
            } else if (input.length > 2) {
                client.say(channel, `@${tags.username}, usage: !snipecd OR !snipecd [5-300 seconds]`);
                return;
            }

            // Store countdown state for cleanup
            countdownChannel = channel;
            countdownStartTime = Date.now();

            // Adjust message for very short countdowns
            if (cd < 7) {
                cd = 7;
                client.say(channel, `Game starting in ${cd - 2} seconds...`);
            } else {
                client.say(channel, `Game starting in ${cd} seconds...`);
            }

            let cdMilliseconds = cd * 1000;

            countdownInterval = setInterval(async () => {
                try {
                    cdMilliseconds -= 1000;
                    const remainingSeconds = cdMilliseconds / 1000;

                    if (cdMilliseconds >= 10000 && cdMilliseconds % 10000 === 0) {
                        client.say(channel, `Game starting in ${remainingSeconds} seconds...`);
                    } else if (cdMilliseconds === 6000) {
                        client.say(channel, "Ready up on GO!");
                    } else if (cdMilliseconds < 6000 && cdMilliseconds > 0) {
                        client.say(channel, `${remainingSeconds}`);
                    } else if (cdMilliseconds === 0) {
                        clearCountdownInterval();
                        client.say(channel, "Let's Goooooooo!!");
                        
                        console.log(`[SNIPECD] Countdown completed in ${channel}:`, {
                            duration: cd,
                            startedBy: tags.username,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    console.error(`[SNIPECD] Error during countdown:`, {
                        message: error.message,
                        channel: channel,
                        timestamp: new Date().toISOString()
                    });
                    clearCountdownInterval();
                }
            }, 1000);

            console.log(`[SNIPECD] Countdown started:`, {
                duration: cd,
                channel: channel,
                startedBy: tags.username,
                timestamp: new Date().toISOString()
            });

        } else if (input[0] === "!cancelcd") {
            if (!isSpecialUp) {
                client.say(channel, `@${tags.username}, !cancelcd is for Special Users & above.`);
                return;
            }

            if (countdownInterval) {
                const canceledBy = tags.username;
                clearCountdownInterval();
                client.say(channel, `Countdown canceled! Look out for new countdown!`);
                
                console.log(`[SNIPECD] Countdown canceled:`, {
                    canceledBy: canceledBy,
                    channel: channel,
                    timestamp: new Date().toISOString()
                });
            } else {
                client.say(channel, `@${tags.username}, there's no ongoing countdown to cancel.`);
            }
        }

    } catch (error) {
        console.error(`[SNIPECD] Error for user ${tags.username}:`, {
            message: error.message,
            command: input[0],
            channel: channel,
            timestamp: new Date().toISOString()
        });

        // Clean up any ongoing countdown on error
        clearCountdownInterval();
        client.say(channel, `@${tags.username}, sorry, countdown service encountered an error.`);
    }
};

// Export cleanup function for graceful shutdown
exports.cleanup = function() {
    clearCountdownInterval();
};