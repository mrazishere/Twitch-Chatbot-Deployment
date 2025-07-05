/**
 * Custom commands
 * 
 * Description: Allow streamer to manage custom commands directly from Twitch chat
 * 
 * 
 * Permission required:
 *          !acomm: Moderators and above
 *          !ecomm: Moderators and above
 *          !dcomm: Moderators and above
 *          !lcomm: Moderators and above
 *          !<commmandName>: all/Mods/VIP (Depends on what's confirgured for modOnly)
 * 
 * Usage:   !acomm modOnly(n/y/v) commandName commandResponse - Add new custom command
 *          !ecomm modOnly(n/y/v) commandName commandResponse - Edit existing custom command
 *          !dcomm commandName - Delete existing custom command
 *          !lcomm - List all custom commands
 *          !<commandName> - Execute custom command
 * 
 * Variables:   $counter - Number of times the command has been used
 *              $user1 - Username of the user who executed the command
 *              $user2 - Username of the mentioned user in the command
 *              $percentage - Random percentage
 *              $streamerp = Random percentage except if user2 is the streamer of the channel, will print 10000000%
 *              $ynm - Random yes/no/maybe
 *  
 */

const fs = require('fs');
const path = require('path');
const {
    promisify
} = require('util');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Rate limiting map to track user requests
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 30000; // 30 seconds
const MAX_REQUESTS = 10; // Max 10 requests per 30 seconds for custom commands

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

// Input sanitization functions
function sanitizeCommandName(name) {
  if (!name || typeof name !== 'string') return '';
  // Only allow alphanumeric characters, no special chars
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 25);
}

function sanitizeCommandResponse(response) {
  if (!response || typeof response !== 'string') return '';
  // Remove potential XSS and harmful content, but allow basic text
  return response.replace(/[<>]/g, '').trim().substring(0, 500);
}

// Path validation to prevent directory traversal
function validateChannelPath(channelName) {
  if (!channelName || typeof channelName !== 'string') return null;
  const sanitized = channelName.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized !== channelName || sanitized.length === 0) return null;
  return sanitized;
}

exports.customC = async function customC(client, message, channel, tags) {
    // Clean and split input to handle invisible Unicode characters
    const input = message.trim().split(" ").filter(part => part.trim().length > 0);
    
    // Check if this is a custom command-related message FIRST
    const isManagementCommand = ['!acomm', '!ecomm', '!dcomm', '!countcomm', '!lcomm'].includes(input[0]);
    const isCustomCommand = input[0].startsWith('!') && input[0].length > 1;
    
    // Early exit if not a command at all
    if (!isManagementCommand && !isCustomCommand) {
        return;
    }
    
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster || tags.isBroadcaster;
    const isMod = badges.moderator || tags.isMod;
    const isVIP = badges.vip || tags.isVip;
    const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = isVIP || isModUp;
    const channelName = channel.startsWith('#') ? channel.substring(1) : channel;
    
    // Validate channel path to prevent directory traversal
    const validatedChannelName = validateChannelPath(channelName);
    if (!validatedChannelName) {
        console.error(`[CUSTOMC] Invalid channel name: ${channelName}`);
        return;
    }

    let customCommands = {};
    try {
        const safePath = path.join(process.env.BOT_FULL_PATH || '.', 'bot-commands', 'custom', `${validatedChannelName}.json`);
        const data = await readFileAsync(safePath, 'utf8');
        customCommands = JSON.parse(data);
    } catch (err) {
        // File doesn't exist yet, start with empty commands
        if (err.code !== 'ENOENT') {
            console.error(`[CUSTOMC] Error loading commands for ${validatedChannelName}:`, err.message);
        }
    }

    function commandExists(commandName) {
        return customCommands.hasOwnProperty(commandName);
    }
    
    // Now check if it's actually a custom command or management command
    if (!isManagementCommand && !commandExists(input[0].substring(1))) {
        return; // Not a custom command we handle
    }
    
    // Check rate limiting only for valid commands
    if (!checkRateLimit(tags.username)) {
        client.say(channel, `@${tags.username}, please wait before using custom commands again.`);
        return;
    }

    // Add command function with security validation
    async function addCommand(commandName, modOnly, commandResponse) {
        // Sanitize inputs
        const sanitizedName = sanitizeCommandName(commandName);
        const sanitizedResponse = sanitizeCommandResponse(commandResponse);
        
        if (!sanitizedName || sanitizedName.length < 3) {
            return `@${tags.username}, Invalid command name! Must be 3-25 alphanumeric characters.`;
        }
        
        if (!sanitizedResponse || sanitizedResponse.length < 1) {
            return `@${tags.username}, Invalid command response!`;
        }
        
        if (commandExists(sanitizedName)) {
            return `@${tags.username}, That command already exists!`;
        }
        
        const commandCounter = 0;
        customCommands[sanitizedName] = [modOnly, sanitizedResponse, commandCounter];

        try {
            const safePath = path.join(process.env.BOT_FULL_PATH || '.', 'bot-commands', 'custom', `${validatedChannelName}.json`);
            await writeFileAsync(safePath, JSON.stringify(customCommands, null, 2), 'utf8');
            console.log(`[CUSTOMC] Command added: ${sanitizedName} by ${tags.username}`);
        } catch (err) {
            console.error(`[CUSTOMC] Error saving command: ${err.message}`);
            return `@${tags.username}, Error saving command!`;
        }

        return `@${tags.username}, !${sanitizedName} Command added!`;
    }

    async function removeCommand(commandName) {
        const sanitizedName = sanitizeCommandName(commandName);
        
        if (!sanitizedName || !commandExists(sanitizedName)) {
            return `@${tags.username}, That command doesn't exist!`;
        }

        delete customCommands[sanitizedName];

        try {
            const safePath = path.join(process.env.BOT_FULL_PATH || '.', 'bot-commands', 'custom', `${validatedChannelName}.json`);
            await writeFileAsync(safePath, JSON.stringify(customCommands, null, 2), 'utf8');
            console.log(`[CUSTOMC] Command removed: ${sanitizedName} by ${tags.username}`);
        } catch (err) {
            console.error(`[CUSTOMC] Error removing command: ${err.message}`);
            return `@${tags.username}, Error removing command!`;
        }

        return `@${tags.username}, !${sanitizedName} Command removed!`;
    }

    // Edit command function with security validation
    async function editCommand(commandName, modOnly, commandResponse, commandCounter, respondToUser = false) {
        const sanitizedName = sanitizeCommandName(commandName);
        const sanitizedResponse = sanitizeCommandResponse(commandResponse);
        
        if (!sanitizedName || !commandExists(sanitizedName)) {
            return `@${tags.username}, That command does not exist!`;
        }
        
        if (!sanitizedResponse || sanitizedResponse.length < 1) {
            return `@${tags.username}, Invalid command response!`;
        }

        customCommands[sanitizedName] = [modOnly, sanitizedResponse, commandCounter];

        try {
            const safePath = path.join(process.env.BOT_FULL_PATH || '.', 'bot-commands', 'custom', `${validatedChannelName}.json`);
            await writeFileAsync(safePath, JSON.stringify(customCommands, null, 2), 'utf8');
            if (respondToUser) {
                console.log(`[CUSTOMC] Command updated: ${sanitizedName} by ${tags.username}`);
            }
        } catch (err) {
            console.error(`[CUSTOMC] Error updating command: ${err.message}`);
            return `@${tags.username}, Error updating command!`;
        }

        // Respond only when called by !ecomm
        if (respondToUser) {
            return `@${tags.username}, !${sanitizedName} Command updated!`;
        }
        return null;
    }

    if (!isModUp && (input[0] === "!acomm" || input[0] === "!ecomm" || input[0] === "!dcomm" || input[0] === "!countcomm")) {
        client.say(channel, `@${tags.username}, Custom Commands are for Moderators & above.`);
        return;
    }

    if (input[0] === "!acomm") {
        if (input.length < 4) {
            client.say(channel, `@${tags.username}, !acomm <modOnly(n/y/v)> <commandName> <commandResponse>`);
            return;
        }

        const modOnly = input[1].toLowerCase();
        const commandName = input[2];
        const commandResponse = input.slice(3).join(" ");

        // Validate modOnly parameter
        if (!["n", "y", "v"].includes(modOnly)) {
            client.say(channel, `@${tags.username}, modOnly must be n/y/v (none/mod/vip)`);
            return;
        }

        // Add the command (validation happens inside addCommand)
        try {
            const response = await addCommand(commandName, modOnly, commandResponse);
            client.say(channel, response);
        } catch (error) {
            console.error(`[CUSTOMC] Error adding command:`, error.message);
            client.say(channel, `@${tags.username}, Error adding command!`);
        }
        return;
    }


    if (input[0] === "!ecomm") {
        if (input.length < 4) {
            client.say(channel, `@${tags.username}, !ecomm <modOnly(n/y/v)> <commandName> <commandResponse>`);
            return;
        }

        const modOnly = input[1].toLowerCase();
        const commandName = input[2];
        const commandResponse = input.slice(3).join(" ");

        // Validate modOnly parameter
        if (!["n", "y", "v"].includes(modOnly)) {
            client.say(channel, `@${tags.username}, modOnly must be n/y/v (none/mod/vip)`);
            return;
        }

        // Check if command exists and get current counter
        const sanitizedName = sanitizeCommandName(commandName);
        if (!sanitizedName || !commandExists(sanitizedName)) {
            client.say(channel, `@${tags.username}, That command does not exist!`);
            return;
        }

        const commandCounter = customCommands[sanitizedName][2];

        // Edit the command (validation happens inside editCommand)
        try {
            const response = await editCommand(sanitizedName, modOnly, commandResponse, commandCounter, true);
            if (response) {
                client.say(channel, response);
            }
        } catch (error) {
            console.error(`[CUSTOMC] Error editing command:`, error.message);
            client.say(channel, `@${tags.username}, Error editing command!`);
        }
        return;
    }

    if (input[0] === "!dcomm") {
        if (input.length < 2) {
            client.say(channel, `@${tags.username}, !dcomm <commandName>`);
            return;
        }

        const commandName = input[1];

        // Remove the command (validation happens inside removeCommand)
        try {
            const response = await removeCommand(commandName);
            client.say(channel, response);
        } catch (error) {
            console.error(`[CUSTOMC] Error removing command:`, error.message);
            client.say(channel, `@${tags.username}, Error removing command!`);
        }
        return;
    }

    // Update command counter
    if (input[0] === "!countcomm") {
        if (input.length < 3) {
            client.say(channel, `@${tags.username}, !countcomm <commandName> <commandCounter>`);
            return;
        }

        const commandName = input[1];
        const commandCounterNew = Number(input[2]);

        // Validate inputs
        if (!Number.isInteger(commandCounterNew) || commandCounterNew < 0) {
            client.say(channel, `@${tags.username}, Counter must be a positive integer!`);
            return;
        }

        const sanitizedName = sanitizeCommandName(commandName);
        if (!sanitizedName || !commandExists(sanitizedName)) {
            client.say(channel, `@${tags.username}, That command doesn't exist!`);
            return;
        }

        const modOnly = customCommands[sanitizedName][0];
        const commandResponse = customCommands[sanitizedName][1];

        // Update the commandCounter
        try {
            await editCommand(sanitizedName, modOnly, commandResponse, commandCounterNew, false);
            client.say(channel, `@${tags.username}, Counter updated to ${commandCounterNew}!`);
        } catch (error) {
            console.error(`[CUSTOMC] Error updating counter:`, error.message);
            client.say(channel, `@${tags.username}, Error updating counter!`);
        }
        return;
    }

    if (input[0] === "!lcomm") {
        // Get the list of custom commands
        const commandList = Object.keys(customCommands);
        // Check if there are any custom commands
        if (commandList.length === 0) {
            client.say(channel, `@${tags.username}, There are no custom commands!`);
            return;
        } else {
            // Send the list of custom commands to chat
            client.say(channel, `@${tags.username}, Custom Commands: "!${commandList.join('", "!')}"`);
            return;
        }
    }
    // Check if the user is trying to call a custom command
    if (commandExists(input[0].substring(1)) && input[0].startsWith('!')) {
        const commandName = input[0].substring(1);
        const commandData = customCommands[commandName];
        const modOnly = commandData[0];
        const commandResponse = commandData[1];
        const commandCounter = commandData[2];
        const commandCounterNew = commandCounter + 1;

        // Update the JSON file with the new counter value (async, don't wait)
        editCommand(commandName, modOnly, commandResponse, commandCounterNew, false).catch(err => {
            console.error(`[CUSTOMC] Error updating counter for ${commandName}:`, err.message);
        });

        // Process command response with variable substitution (securely)
        let response = sanitizeCommandResponse(commandResponse);
        
        // Replace variables with sanitized values
        if (response.includes("$counter")) {
            response = response.replace(/\$counter/g, commandCounterNew.toString());
        }
        if (response.includes("$user1")) {
            response = response.replace(/\$user1/g, tags.username);
        }
        
        // Safe user2 extraction
        let user2 = tags.username; // Default to command user
        if (response.includes("$user2")) {
            if (message.includes("@")) {
                const mentionMatch = message.match(/@([a-zA-Z0-9_]{1,25})/);
                if (mentionMatch) {
                    user2 = mentionMatch[1];
                }
            }
            response = response.replace(/\$user2/g, `@${user2}`);
        }
        
        if (response.includes("$percentage")) {
            response = response.replace(/\$percentage/g, `${Math.floor(Math.random() * 100)}%`);
        }
        
        if (response.includes("$streamerp")) {
            if (user2.toLowerCase() === validatedChannelName.toLowerCase()) {
                // Generate a random number between 100 and 10,000,000 for streamer
                const randomPercentage = Math.floor(Math.random() * (10000000 - 100 + 1)) + 100;
                response = response.replace(/\$streamerp/g, `${randomPercentage}%`);
            } else {
                response = response.replace(/\$streamerp/g, `${Math.floor(Math.random() * 100)}%`);
            }
        }
        
        if (response.includes("$ynm")) {
            const yesNoMaybe = ["Yes", "No", "Maybe"];
            response = response.replace(/\$ynm/g, yesNoMaybe[Math.floor(Math.random() * yesNoMaybe.length)]);
        }

        // Check permissions and execute command
        if (modOnly === "y" && !isModUp) {
            return; // Silently ignore for mod-only commands
        } else if (modOnly === "v" && !isVIPUp) {
            return; // Silently ignore for VIP+ commands
        } else {
            // Execute the command
            client.say(channel, response);
            return;
        }
    }
}