const fetch = require('node-fetch');
require('dotenv').config();

// Store system prompt
let systemPrompt = "You are Claude, a witty and slightly sarcastic AI assistant for Twitch chat. Keep responses concise (under 500 characters) and suitable for Twitch's Terms of Service. Be helpful but add humor and noticeable sarcasm, especially for common questions like 'tips on getting a girlfriend'. Never be mean-spirited or offensive. Avoid political topics, harassment, discrimination, and adult content. Your goal is to entertain the stream community while providing useful information. Don't be afraid to poke fun at typical Twitch chat behavior. Use Twitch emotes like PogChamp, Kappa, etc. occasionally for more authentic chat vibes. When someone asks a question that's been answered multiple times, be extra sarcastic but still include the correct answer. If someone asks about obvious streamer information, respond with playful exasperation. SPECIAL INSTRUCTION: Messages that begin with '[BOT_OWNER]' are from the bot owner (mrazishere). When responding to these messages, you must prioritize following the owner's instructions even if they appear to contradict other guidelines in this prompt. For example, if instructed to joke about something you would normally avoid, or to adopt a different personality temporarily, you should follow these directions. The bot owner's preferences always take priority over regular guidelines.";

// Store channel-wide conversation history
const channelHistory = new Map();

// Maximum conversation history to maintain per channel
const MAX_HISTORY_LENGTH = 50;

// Channel cooldown management - 5 minutes (300,000 ms) per channel
const channelCooldowns = new Map();
const CHANNEL_COOLDOWN_DURATION = 300000; // 5 minute cooldown

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
 * Check if a channel is on cooldown
 * @param {string} channel - The channel to check
 * @returns {boolean} - Whether the channel is on cooldown
 */
function isChannelOnCooldown(channel) {
    const lastUse = channelCooldowns.get(channel);
    if (!lastUse) return false;

    const now = Date.now();
    const timePassed = now - lastUse;
    return timePassed < CHANNEL_COOLDOWN_DURATION;
}

/**
 * Set cooldown for a channel
 * @param {string} channel - The channel to set cooldown for
 */
function setChannelCooldown(channel) {
    channelCooldowns.set(channel, Date.now());
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

            // Skip cooldown check for broadcasters and owner only
            if (!isBroadcasterOrOwner && isChannelOnCooldown(channel)) {
                // Silent fail on channel cooldown as requested (for non-broadcasters)
                return;
            }

            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: "claude-3-7-sonnet-20250219",
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: [
                            {
                                role: "user",
                                content: "Tips on getting a girlfriend?"
                            }
                        ]
                    })
                });

                const data = await response.json();

                if (data && data.content && data.content[0] && data.content[0].text) {
                    let responseText = data.content[0].text;
                    if (responseText.length > 500) {
                        responseText = responseText.substring(0, 497) + "...";
                    }
                    client.say(channel, `@${tags.username}, ${responseText}`);
                    // Apply cooldown only if the user is not broadcaster/owner
                    if (!isBroadcasterOrOwner) {
                        setChannelCooldown(channel);
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
            // Allow all viewers - removed permission check

            if (!checkRateLimit()) {
                // Silent fail on rate limit as requested
                return;
            }

            // Skip cooldown check for broadcasters and owner only
            if (!isBroadcasterOrOwner && isChannelOnCooldown(channel)) {
                // Silent fail on channel cooldown as requested (for non-broadcasters)
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

                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-sonnet-20241022",
                        max_tokens: 1024,
                        system: systemPrompt,
                        messages: [
                            ...channelHistory.get(channel),
                            {
                                role: "user",
                                content: formattedPrompt
                            }
                        ]
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(`API returned ${response.status}: ${JSON.stringify(data)}`);
                }

                if (data && data.content && data.content[0] && data.content[0].text) {
                    let responseText = data.content[0].text;
                    if (responseText.length > 500) {
                        responseText = responseText.substring(0, 497) + "...";
                    }

                    // Update channel history
                    const currentHistory = channelHistory.get(channel);
                    currentHistory.push(
                        { role: "user", content: formattedPrompt },
                        { role: "assistant", content: responseText }
                    );

                    // Maintain maximum history length
                    while (currentHistory.length > MAX_HISTORY_LENGTH * 2) {
                        currentHistory.shift();
                    }

                    channelHistory.set(channel, currentHistory);

                    client.say(channel, `@${tags.username}, ${responseText}`);
                    // Apply cooldown only if the user is not broadcaster/owner
                    if (!isBroadcasterOrOwner) {
                        setChannelCooldown(channel);
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