/**
 * Twitch chat multiple timer command
 * 
 * Description: Allows streamers to start a timer in the channel's chat.
 *              Some use purposes include: channel redemption with timer
 *              In order for the countdown to work, the bot needs to be at least a VIP or above due to Twitch's chat cooldown.
 * 
 * Permission required: VIPs and above
 * 
 * Usage:
 *   !countd list - List active countdowns
 *   !countd add [title] ['n's | 'n'm | 'n'h] - Start timer in 'n' seconds/minutes/hours
 *   !countd edit [title] ['n's | 'n'm | 'n'h] - Edit timer for [title]
 *   !countd delete [title] - Delete the specified timer
 * 
 */

const fs = require('fs');
const path = require('path');
const COUNTDOWN_FILE = path.join(__dirname, '..', 'countd.json');

// Function to read countdown data from JSON file
function readCountdownsFromFile() {
    try {
        const data = fs.readFileSync(COUNTDOWN_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        // SECURITY: Validate JSON structure
        if (typeof parsed !== 'object' || parsed === null) {
            console.error('Invalid countdown JSON structure: not an object');
            return {};
        }
        
        // Validate and sanitize countdown objects
        const sanitized = {};
        for (const [id, countdown] of Object.entries(parsed)) {
            if (countdown && 
                typeof countdown === 'object' &&
                typeof countdown.channel === 'string' &&
                typeof countdown.title === 'string' &&
                typeof countdown.duration === 'number' &&
                typeof countdown.startTime === 'number' &&
                typeof countdown.counter === 'number') {
                
                // Sanitize the title during load
                const sanitizedTitle = validateAndSanitizeTitle(countdown.title);
                if (sanitizedTitle) {
                    sanitized[id] = {
                        channel: countdown.channel,
                        title: sanitizedTitle,
                        duration: countdown.duration,
                        startTime: countdown.startTime,
                        counter: countdown.counter
                    };
                }
            }
        }
        
        return sanitized;
    } catch (error) {
        console.error('Error reading countdown file:', error);
        return {};
    }
}

// Function to write countdown data to JSON file
function writeCountdownsToFile(countdowns) {
    try {
        const sanitizedCountdowns = {};
        for (const id in countdowns) {
            const { channel, title, duration, startTime, counter } = countdowns[id];
            sanitizedCountdowns[id] = { channel, title, duration, startTime, counter };
        }
        fs.writeFileSync(COUNTDOWN_FILE, JSON.stringify(sanitizedCountdowns, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing to countdown file:', error);
    }
}

let countdowns = readCountdownsFromFile();
let countdownIDCounter = 1; // Counter for generating unique countdown IDs

// SECURITY: Validation and sanitization functions
function validateAndSanitizeTitle(title) {
    if (!title || typeof title !== 'string') {
        return null;
    }
    
    // Remove potential script tags and HTML
    title = title.replace(/<[^>]*>/g, '');
    
    // Limit title length to prevent DoS
    if (title.length > 50) {
        title = title.substring(0, 50);
    }
    
    // Remove control characters and null bytes
    title = title.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Trim whitespace
    title = title.trim();
    
    if (title.length === 0) {
        return null;
    }
    
    return title;
}

function validateDuration(duration, unit) {
    if (isNaN(duration) || duration <= 0) {
        return false;
    }
    
    if (unit !== 's' && unit !== 'm' && unit !== 'h') {
        return false;
    }
    
    // Convert to seconds for validation
    let seconds = duration;
    if (unit === 'm') seconds *= 60;
    if (unit === 'h') seconds *= 3600;
    
    // Limit maximum duration to 24 hours
    if (seconds > 86400) {
        return false;
    }
    
    return true;
}

function getChannelCountdownCount(channel) {
    return Object.values(countdowns).filter(countdown => countdown.channel === channel).length;
}

exports.countd = async function countd(client, message, channel, tags) {
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    function listCountdowns(client, channel, tags) {
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
        const activeCountdowns = Object.values(countdowns).filter(countdown => countdown.channel === channel);

        if (activeCountdowns.length > 0) {
            const countdownInfo = activeCountdowns.map(countdown => {
                const elapsedTime = currentTime - countdown.startTime;
                const remainingTime = Math.max(countdown.duration - elapsedTime, 0);
                const formattedRemainingTime = formatTime(remainingTime);
                return `[${countdown.title}/${formattedRemainingTime}] (Counter: ${countdown.counter})`;
            }).join(" ");

            client.say(channel, `Active countdowns: ${countdownInfo}`);
        } else {
            client.say(channel, "No active countdowns.");
        }
    }

    function removeCountdown(client, channel, tags, rawTitle) {
        // SECURITY: Validate and sanitize title
        const title = validateAndSanitizeTitle(rawTitle);
        if (!title) {
            client.say(channel, `@${tags.username}, invalid title. Use alphanumeric characters only, max 50 chars.`);
            return;
        }

        const countdownIDToRemove = Object.keys(countdowns).find(id => countdowns[id].title === title && countdowns[id].channel === channel);
        if (countdownIDToRemove) {
            clearInterval(countdowns[countdownIDToRemove].interval);
            delete countdowns[countdownIDToRemove];
            writeCountdownsToFile(countdowns);
            client.say(channel, `Countdown "${title}" removed.`);
        } else {
            client.say(channel, `@${tags.username}, countdown "${title}" not found.`);
        }
    }

    function addCountdown(client, channel, tags, params) {
        try {
            // SECURITY: Check countdown limit per channel (max 5 active)
            if (getChannelCountdownCount(channel) >= 5) {
                client.say(channel, `@${tags.username}, maximum of 5 active countdowns per channel.`);
                return;
            }

            // SECURITY: Improved parsing to handle quoted titles
            let rawTitle, durationStr;
            
            if (params.startsWith('"')) {
                // Handle quoted title: "title with spaces" duration
                const closeQuoteIndex = params.indexOf('"', 1);
                if (closeQuoteIndex !== -1) {
                    rawTitle = params.substring(1, closeQuoteIndex); // Extract content between quotes
                    const remaining = params.substring(closeQuoteIndex + 1).trim();
                    durationStr = remaining.split(" ")[0]; // First word after quoted title
                } else {
                    // Unclosed quote - treat as regular parsing
                    const args = params.split(" ");
                    rawTitle = args.shift();
                    durationStr = args.shift();
                }
            } else {
                // Regular parsing for unquoted titles
                const args = params.split(" ");
                rawTitle = args.shift();
                durationStr = args.shift();
            }

            if (!rawTitle || !durationStr) {
                client.say(channel, `@${tags.username}, invalid usage of command. Usage: !countd add [title] [number][s/m/h]`);
                return;
            }

            // SECURITY: Validate and sanitize title
            const title = validateAndSanitizeTitle(rawTitle);
            if (!title) {
                client.say(channel, `@${tags.username}, invalid title. Use alphanumeric characters only, max 50 chars.`);
                return;
            }

            const unit = durationStr.slice(-1); // Get the last character to determine the unit
            const duration = parseInt(durationStr.slice(0, -1)); // Get the duration without the unit

            // SECURITY: Validate duration and unit
            if (!validateDuration(duration, unit)) {
                client.say(channel, `@${tags.username}, invalid duration. Use 1-86400s, 1-1440m, or 1-24h (max 24 hours).`);
                return;
            }

            // Check if a countdown with the same title already exists
            const existingCountdown = Object.values(countdowns).find(countdown => countdown.title === title && countdown.channel === channel);
            if (existingCountdown) {
                client.say(channel, `@${tags.username}, a countdown with the title "${title}" is already active.`);
                return;
            }

            let cd = duration;
            if (unit === 'm') {
                cd *= 60; // Convert minutes to seconds
            } else if (unit === 'h') {
                cd *= 3600; // Convert hours to seconds
            }

            const countdownID = countdownIDCounter++; // Generate unique countdown ID
            const startTime = Math.floor(Date.now() / 1000); // Current time in seconds
            const counter = 0; // Initialize counter

            client.say(channel, `Countdown "${title}" ending in ${formatTime(cd)}...`);

            const intervals = [5, 4, 3, 2, 1];
            let intervalIndex = 0;

            const countdownInterval = setInterval(() => {
                if (cd >= 600 && cd % 600 === 0) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                } else if (cd === 300) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                } else if (cd <= intervals[intervalIndex]) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                    intervalIndex++;
                }

                cd -= 1;

                if (cd === 0) {
                    clearInterval(countdownInterval);
                    client.say(channel, `Countdown "${title}" - Time's Up!`);
                    delete countdowns[countdownID];
                    writeCountdownsToFile(countdowns);
                }
            }, 1000);

            // Add the countdown to the active countdowns with start time, interval, and counter
            countdowns[countdownID] = { channel, title, duration: cd, startTime, interval: countdownInterval, counter };
            writeCountdownsToFile(countdowns);
        } catch (error) {
            console.error('Error adding countdown:', error);
            client.say(channel, `@${tags.username}, an error occurred while adding the countdown.`);
        }
    }

    function editCountdown(client, channel, tags, params) {
        try {
            // SECURITY: Improved parsing to handle quoted titles
            let rawTitle, durationStr;
            
            if (params.startsWith('"')) {
                // Handle quoted title: "title with spaces" duration
                const closeQuoteIndex = params.indexOf('"', 1);
                if (closeQuoteIndex !== -1) {
                    rawTitle = params.substring(1, closeQuoteIndex); // Extract content between quotes
                    const remaining = params.substring(closeQuoteIndex + 1).trim();
                    durationStr = remaining.split(" ")[0]; // First word after quoted title
                } else {
                    // Unclosed quote - treat as regular parsing
                    const args = params.split(" ");
                    rawTitle = args.shift();
                    durationStr = args.shift();
                }
            } else {
                // Regular parsing for unquoted titles
                const args = params.split(" ");
                rawTitle = args.shift();
                durationStr = args.shift();
            }

            if (!rawTitle || !durationStr) {
                client.say(channel, `@${tags.username}, invalid usage of command. Usage: !countd edit [title] [number][s/m/h]`);
                return;
            }

            // SECURITY: Validate and sanitize title
            const title = validateAndSanitizeTitle(rawTitle);
            if (!title) {
                client.say(channel, `@${tags.username}, invalid title. Use alphanumeric characters only, max 50 chars.`);
                return;
            }

            const unit = durationStr.slice(-1); // Get the last character to determine the unit
            const newDuration = parseInt(durationStr.slice(0, -1)); // Get the new duration without the unit

            // SECURITY: Validate duration and unit
            if (!validateDuration(newDuration, unit)) {
                client.say(channel, `@${tags.username}, invalid duration. Use 1-86400s, 1-1440m, or 1-24h (max 24 hours).`);
                return;
            }

            const countdownID = Object.keys(countdowns).find(id => countdowns[id].title === title && countdowns[id].channel === channel);
            if (!countdownID) {
                client.say(channel, `@${tags.username}, countdown "${title}" not found.`);
                return;
            }

            clearInterval(countdowns[countdownID].interval); // Stop the existing countdown

            let cd = newDuration;
            if (unit === 'm') {
                cd *= 60; // Convert minutes to seconds
            } else if (unit === 'h') {
                cd *= 3600; // Convert hours to seconds
            }

            const startTime = Math.floor(Date.now() / 1000); // Current time in seconds
            client.say(channel, `Countdown "${title}" edited to ${formatTime(cd)}...`);

            const intervals = [60, 30, 5, 4, 3, 2, 1];
            let intervalIndex = 0;

            const countdownInterval = setInterval(() => {
                if (cd >= 600 && cd % 600 === 0) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                } else if (cd === 300) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                } else if (cd <= intervals[intervalIndex]) {
                    client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                    intervalIndex++;
                }

                cd -= 1;

                if (cd === 0) {
                    clearInterval(countdownInterval);
                    client.say(channel, `Countdown "${title}" - Time's Up!`);
                    delete countdowns[countdownID];
                    writeCountdownsToFile(countdowns);
                }
            }, 1000);

            // Update the countdown with the new duration, start time, and interval
            countdowns[countdownID] = { channel, title, duration: cd, startTime, interval: countdownInterval, counter: countdowns[countdownID].counter };
            writeCountdownsToFile(countdowns);
        } catch (error) {
            console.error('Error editing countdown:', error);
            client.say(channel, `@${tags.username}, an error occurred while editing the countdown.`);
        }
    }

    function incrementCounter(client, channel, tags, rawTitle) {
        // SECURITY: Validate and sanitize title
        const title = validateAndSanitizeTitle(rawTitle);
        if (!title) {
            client.say(channel, `@${tags.username}, invalid title. Use alphanumeric characters only, max 50 chars.`);
            return;
        }

        const countdownID = Object.keys(countdowns).find(id => countdowns[id].title === title && countdowns[id].channel === channel);
        if (countdownID) {
            countdowns[countdownID].counter += 1;
            writeCountdownsToFile(countdowns);
            //client.say(channel, `Counter for "${title}" incremented to ${countdowns[countdownID].counter}.`);
        } else {
            client.say(channel, `@${tags.username}, countdown "${title}" not found.`);
        }
    }

    function decrementCounter(client, channel, tags, rawTitle) {
        // SECURITY: Validate and sanitize title
        const title = validateAndSanitizeTitle(rawTitle);
        if (!title) {
            client.say(channel, `@${tags.username}, invalid title. Use alphanumeric characters only, max 50 chars.`);
            return;
        }

        const countdownID = Object.keys(countdowns).find(id => countdowns[id].title === title && countdowns[id].channel === channel);
        if (countdownID) {
            countdowns[countdownID].counter -= 1;
            writeCountdownsToFile(countdowns);
            //client.say(channel, `Counter for "${title}" decremented to ${countdowns[countdownID].counter}.`);
        } else {
            client.say(channel, `@${tags.username}, countdown "${title}" not found.`);
        }
    }

    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
    const isMod = badges.moderator || tags.isMod;
    const isVIP = badges.vip || tags.isVip;
    const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = isVIP || isModUp;
    const input = message.split(" ");

    if (input[0] === "!countd") {
        if (input[1] === "list") {
            listCountdowns(client, channel, tags);
        } else if (isVIPUp) {
            if (input[1] === "add") {
                addCountdown(client, channel, tags, input.slice(2).join(" "));
            } else if (input[1] === "remove") {
                removeCountdown(client, channel, tags, input.slice(2).join(" "));
            } else if (input[1] === "edit") {
                editCountdown(client, channel, tags, input.slice(2).join(" "));
            } else if (input[1] === "+") {
                incrementCounter(client, channel, tags, input.slice(2).join(" "));
            } else if (input[1] === "-") {
                decrementCounter(client, channel, tags, input.slice(2).join(" "));
            } else {
                client.say(channel, `@${tags.username}, invalid usage of command.`);
            }
        } else {
            client.say(channel, `@${tags.username}, !countd commands are for VIPs & above.`);
        }
    }
};
