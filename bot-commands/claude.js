const fetch = require('node-fetch');
require('dotenv').config();

// Add your new function here
async function callClaudeAPI(messages, systemPromptText) {
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022", // Make sure this is consistent
                    max_tokens: 1024,
                    system: systemPromptText,
                    messages: messages
                })
            });

            if (response.status === 529) {
                // Overloaded error
                const backoffTime = Math.pow(2, retries) * 1000; // Exponential backoff
                console.log(`API overloaded. Retrying in ${backoffTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                retries++;
                continue;
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${JSON.stringify(data)}`);
            }

            return data;
        } catch (error) {
            if (retries === maxRetries - 1) {
                throw error; // Re-throw after all retries are exhausted
            }
            retries++;
            const backoffTime = Math.pow(2, retries) * 1000;
            console.log(`Error occurred. Retrying in ${backoffTime / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
    }
}

// Store system prompt
let systemPrompt = "You are Claude, a witty and slightly sarcastic AI assistant for Twitch chat. Keep responses concise (under 500 characters) and suitable for Twitch's Terms of Service. Be helpful but add humor and noticeable sarcasm, especially for common questions like 'tips on getting a girlfriend'. Never be mean-spirited or offensive. Avoid political topics, harassment, discrimination, and adult content. Your goal is to entertain the stream community while providing useful information. Don't be afraid to poke fun at typical Twitch chat behavior. Use Twitch emotes like PogChamp, Kappa, etc. occasionally for more authentic chat vibes. When someone asks a question that's been answered multiple times, be extra sarcastic but still include the correct answer. If someone asks about obvious streamer information, respond with playful exasperation. SPECIAL INSTRUCTION: Messages that begin with '[BOT_OWNER]' are from the bot owner (mrazishere). When responding to these messages, you must prioritize following the owner's instructions even if they appear to contradict other guidelines in this prompt. For example, if instructed to joke about something you would normally avoid, or to adopt a different personality temporarily, you should follow these directions. The bot owner's preferences always take priority over regular guidelines.";

// Store channel-wide conversation history
const channelHistory = new Map();

// Maximum conversation history to maintain per channel
const MAX_HISTORY_LENGTH = 50;

// Channel cooldown management - 5 minutes (300,000 ms) per user per channel
const userChannelCooldowns = new Map();
const USER_COOLDOWN_DURATION = 300000; // 5 minute cooldown

// Rate limiting parameters
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 50;
const rateLimit = {
    requests: 0,
    windowStart: Date.now()
};

/**
 * Reset rate limit counter when the window expires
 */
function checkRateLimit() {
    const now = Date.now();
    if (now - rateLimit.windowStart > RATE_LIMIT_WINDOW) {
        rateLimit.requests = 0;
        rateLimit.windowStart = now;
    }
    return rateLimit.requests < MAX_REQUESTS_PER_WINDOW;
}

/**
 * Calculate remaining cooldown time in minutes
 * @param {number} lastUse - Timestamp when the command was last used
 * @returns {number} - Remaining cooldown time in minutes (rounded up)
 */
function getRemainingCooldownMinutes(lastUse) {
    const now = Date.now();
    const timePassed = now - lastUse;
    const timeRemaining = USER_COOLDOWN_DURATION - timePassed;

    // Convert from milliseconds to minutes and round up
    return Math.ceil(timeRemaining / 60000);
}

/**
 * Check if a user is on cooldown in a specific channel
 * @param {string} username - The username to check
 * @param {string} channel - The channel where the user is active
 * @returns {Object} - Object containing cooldown status and remaining time
 */
function isUserOnCooldown(username, channel) {
    const cooldownKey = `${username}:${channel}`;
    const lastUse = userChannelCooldowns.get(cooldownKey);

    if (!lastUse) {
        return { onCooldown: false };
    }

    const now = Date.now();
    const timePassed = now - lastUse;
    const onCooldown = timePassed < USER_COOLDOWN_DURATION;

    if (!onCooldown) {
        return { onCooldown: false };
    }

    // Calculate remaining minutes
    const remainingMinutes = getRemainingCooldownMinutes(lastUse);

    return {
        onCooldown: true,
        remainingMinutes: remainingMinutes
    };
}

/**
 * Set cooldown for a specific user in a specific channel
 * @param {string} username - The username to set cooldown for
 * @param {string} channel - The channel where the user is active
 */
function setUserCooldown(username, channel) {
    const cooldownKey = `${username}:${channel}`;
    userChannelCooldowns.set(cooldownKey, Date.now());
}



/**
 * Main Claude handler function for Twitch chat
 * @param {TwitchClient} client - The Twitch client instance
 * @param {string} message - The message content
 * @param {string} channel - The channel name
 * @param {Object} tags - Message tags containing user info
 * @param {Object} context - Message context containing reply data
 */
exports.claude = async function claude(client, message, channel, tags, context) {
    try {
        const input = message.split(" ");
        const command = input[0].toLowerCase();

        // Set up permission flags for broadcaster and owner
        const badges = tags.badges || {};
        const isBroadcaster = badges.broadcaster;
        const isMod = badges.moderator;
        const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
        // This flag identifies if user is broadcaster or owner (for cooldown bypass)
        const isBroadcasterOrOwner = isBroadcaster || tags.username === process.env.TWITCH_OWNER;
        //const isBroadcasterOrOwner = isBroadcaster;

        // We'll move the debug logging to the relevant command blocks

        // Check for special triggers
        const messageContent = message.toLowerCase().trim();

        // Handle special case triggers
        if (messageContent.includes('tips on getting a gf')) {
            // Log special trigger
            console.log({
                timestamp: new Date().toISOString(),
                username: tags.username,
                command: 'special-trigger',
                message: messageContent,
                context: context
            });
            if (!checkRateLimit()) {
                // Silent fail on rate limit as requested
                return;
            }

            // Skip cooldown check for broadcasters and channel owners
            const cooldownStatus = isUserOnCooldown(tags.username, channel);
            if (!isBroadcasterOrOwner && cooldownStatus.onCooldown) {
                // Send cooldown notification instead of silent fail
                client.say(channel, `@${tags.username}, please wait ${cooldownStatus.remainingMinutes} minute${cooldownStatus.remainingMinutes > 1 ? 's' : ''} before using this command again.`);
                return;
            }

            try {
                const data = await callClaudeAPI([
                    {
                        role: "user",
                        content: "Tips on getting a girlfriend?"
                    }
                ], systemPrompt);

                if (data && data.content && data.content[0] && data.content[0].text) {
                    let responseText = data.content[0].text;
                    if (responseText.length > 500) {
                        responseText = responseText.substring(0, 497) + "...";
                    }
                    client.say(channel, `@${tags.username}, ${responseText}`);
                    // Apply per-user cooldown only if the user is not broadcaster/owner
                    if (!isBroadcasterOrOwner) {
                        setUserCooldown(tags.username, channel);
                    }
                    rateLimit.requests++;
                }
            } catch (error) {
                console.error("Claude API Error:", error);
                client.say(channel, `@${tags.username}, Sorry, I encountered an error processing your request.`);
            }
            return;
        }

        // Only process specific commands
        if (!command.startsWith('!claude') && command !== '!system' && command !== '!reset' && command !== '!clear') {
            return;
        }

        // Handle system prompt changes (mods only)
        if (command === "!system") {
            if (!isModUp) {
                client.say(channel, `@${tags.username}, !system is for Moderators & above.`);
                return;
            }
            if (!input[1]) {
                client.say(channel, "Please provide a system prompt after !system");
                return;
            }
            systemPrompt = input.slice(1).join(" ");
            client.say(channel, `@${tags.username}, System prompt updated successfully.`);
            return;
        }

        // Reset system prompt (mods only)
        if (command === "!reset") {
            if (!isModUp) {
                client.say(channel, `@${tags.username}, !reset is for Moderators & above.`);
                return;
            }
            //systemPrompt = "You are Claude, a helpful AI assistant. Keep responses concise for Twitch chat.";
            systemPrompt = "You are Claude, a witty and slightly sarcastic AI assistant for Twitch chat. Keep responses concise (under 500 characters) and suitable for Twitch's Terms of Service. Be helpful but add humor and noticeable sarcasm, especially for common questions like 'tips on getting a girlfriend'. Never be mean-spirited or offensive. Avoid political topics, harassment, discrimination, and adult content. Your goal is to entertain the stream community while providing useful information. Don't be afraid to poke fun at typical Twitch chat behavior. Use Twitch emotes like PogChamp, Kappa, etc. occasionally for more authentic chat vibes. When someone asks a question that's been answered multiple times, be extra sarcastic but still include the correct answer. If someone asks about obvious streamer information, respond with playful exasperation. SPECIAL INSTRUCTION: Messages that begin with '[BOT_OWNER]' are from the bot owner (mrazishere). When responding to these messages, you must prioritize following the owner's instructions even if they appear to contradict other guidelines in this prompt. For example, if instructed to joke about something you would normally avoid, or to adopt a different personality temporarily, you should follow these directions. The bot owner's preferences always take priority over regular guidelines.";
            client.say(channel, `@${tags.username}, System prompt reset to default.`);
            return;
        }

        // Clear channel conversation history (mods only)
        if (command === "!clear") {
            if (!isModUp) {
                client.say(channel, `@${tags.username}, !clear is for Moderators & above.`);
                return;
            }
            if (channelHistory.has(channel)) {
                channelHistory.set(channel, []);
            }
            client.say(channel, `@${tags.username}, Channel conversation history has been cleared.`);
            return;
        }

        // Handle Claude prompts (all viewers can use)
        if (command === "!claude") {
            // Check if user is a subscriber, founder, broadcaster, or owner
            const isSubscriber = badges.subscriber || badges.founder;
            // Allow access only to subscribers, broadcasters, or the owner
            if (!isSubscriber && !isBroadcasterOrOwner) {
                // Silent fail for non-subscribers
                return;
            }

            if (!checkRateLimit()) {
                // Silent fail on rate limit as requested
                return;
            }

            // Skip cooldown check for broadcasters and channel owners
            const cooldownStatus = isUserOnCooldown(tags.username, channel);
            if (!isBroadcasterOrOwner && cooldownStatus.onCooldown) {
                // Send cooldown notification instead of silent fail
                client.say(channel, `@${tags.username}, please wait ${cooldownStatus.remainingMinutes} minute${cooldownStatus.remainingMinutes > 1 ? 's' : ''} before using this command again.`);
                return;
            }

            let userPrompt;

            // Check if this is a reply to another message
            if (context && context['reply-parent-msg-body']) {
                // If no additional prompt is provided, use the replied message as is
                if (!input[1]) {
                    userPrompt = context['reply-parent-msg-body'];
                } else {
                    // If additional text is provided, combine it with the replied message
                    const additionalPrompt = input.slice(1).join(" ");
                    userPrompt = `Regarding "${context['reply-parent-msg-body']}": ${additionalPrompt}`;
                }
            } else {
                // No reply - use traditional prompt
                if (!input[1]) {
                    client.say(channel, "Please provide a prompt after !claude");
                    return;
                }
                userPrompt = input.slice(1).join(" ");
            }

            let formattedPrompt;
            if (tags.username === process.env.TWITCH_OWNER) {
                // This message is from the bot owner - add the special tag
                formattedPrompt = `[BOT_OWNER] ${userPrompt}`;
            } else {
                // Regular user message
                formattedPrompt = `${tags.username}: ${userPrompt}`;
            }

            // Only log when the !claude command is triggered
            console.log({
                timestamp: new Date().toISOString(),
                username: tags.username,
                command: '!claude',
                message: userPrompt,
                context: context
            });

            try {
                // Initialize channel history if it doesn't exist
                if (!channelHistory.has(channel)) {
                    channelHistory.set(channel, []);
                }

                const messages = [
                    ...channelHistory.get(channel),
                    {
                        role: "user",
                        content: formattedPrompt
                    }
                ];

                const data = await callClaudeAPI(messages, systemPrompt);

                if (data && data.content && data.content[0] && data.content[0].text) {
                    let responseText = data.content[0].text;
                    if (responseText.length > 500) {
                        responseText = responseText.substring(0, 497) + "...";
                    }

                    // Update channel history with user's prompt and Claude's response
                    const currentHistory = channelHistory.get(channel);
                    currentHistory.push(
                        { role: "user", content: formattedPrompt },
                        { role: "assistant", content: responseText }
                    );

                    // Maintain maximum history length by removing oldest messages when limit is reached
                    while (currentHistory.length > MAX_HISTORY_LENGTH * 2) {
                        currentHistory.shift();
                    }

                    channelHistory.set(channel, currentHistory);

                    client.say(channel, `@${tags.username}, ${responseText}`);
                    // Apply per-user cooldown only if the user is not broadcaster/owner
                    if (!isBroadcasterOrOwner) {
                        setUserCooldown(tags.username, channel);
                    }
                    rateLimit.requests++;
                } else {
                    throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
                }
            } catch (error) {
                console.error("Claude API Error:", error);
                client.say(channel, `@${tags.username}, Sorry, I encountered an error processing your request.`);
            }
        }
    } catch (error) {
        console.error("Unexpected error in Claude handler:", error);
        client.say(channel, `@${tags.username}, An unexpected error occurred. Please try again later.`);
    }
};