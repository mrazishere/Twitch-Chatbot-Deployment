const fs = require('fs');
const path = require('path');
const COUNTDOWN_FILE = path.join(__dirname, '..', 'countd.json');

// Function to read countdown data from JSON file
function readCountdownsFromFile() {
    try {
        const data = fs.readFileSync(COUNTDOWN_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading countdown file:', error);
        return {};
    }
}

// Function to write countdown data to JSON file
function writeCountdownsToFile(countdowns) {
    try {
        fs.writeFileSync(COUNTDOWN_FILE, JSON.stringify(countdowns, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing to countdown file:', error);
    }
}

let countdowns = readCountdownsFromFile();
let countdownIDCounter = 1; // Counter for generating unique countdown IDs

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
                return `[${countdown.title}/${formattedRemainingTime}]`;
            }).join(" ");

            client.say(channel, `Active countdowns: ${countdownInfo}`);
        } else {
            client.say(channel, "No active countdowns.");
        }
    }

    function removeCountdown(client, channel, tags, title) {
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
            const args = params.split(" ");
            const title = args.shift(); // Extract the title from the arguments
            const durationStr = args.shift(); // Extract the duration string from the arguments
            const unit = durationStr.slice(-1); // Get the last character to determine the unit
            const duration = parseInt(durationStr.slice(0, -1)); // Get the duration without the unit

            if (!title || isNaN(duration) || !unit || (unit !== 's' && unit !== 'm')) {
                client.say(channel, `@${tags.username}, invalid usage of command. Usage: !countd add [title] [number][s/m]`);
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
            }

            const countdownID = countdownIDCounter++; // Generate unique countdown ID
            const startTime = Math.floor(Date.now() / 1000); // Current time in seconds

            client.say(channel, `Countdown "${title}" ending in ${formatTime(cd)}...`);

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

            // Add the countdown to the active countdowns with start time and interval
            countdowns[countdownID] = { channel, title, duration: cd, startTime, interval: countdownInterval };
            writeCountdownsToFile(countdowns);
        } catch (error) {
            console.error('Error adding countdown:', error);
            client.say(channel, `@${tags.username}, an error occurred while adding the countdown.`);
        }
    }

    function editCountdown(client, channel, tags, params) {
        try {
            const args = params.split(" ");
            const title = args.shift(); // Extract the title from the arguments
            const durationStr = args.shift(); // Extract the new duration string from the arguments
            const unit = durationStr.slice(-1); // Get the last character to determine the unit
            const newDuration = parseInt(durationStr.slice(0, -1)); // Get the new duration without the unit

            if (!title || isNaN(newDuration) || !unit || (unit !== 's' && unit !== 'm')) {
                client.say(channel, `@${tags.username}, invalid usage of command. Usage: !countd edit [title] [number][s/m]`);
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
            countdowns[countdownID] = { channel, title, duration: cd, startTime, interval: countdownInterval };
            writeCountdownsToFile(countdowns);
        } catch (error) {
            console.error('Error editing countdown:', error);
            client.say(channel, `@${tags.username}, an error occurred while editing the countdown.`);
        }
    }

    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
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
            } else {
                client.say(channel, `@${tags.username}, invalid usage of command.`);
            }
        } else {
            client.say(channel, `@${tags.username}, !countd commands are for VIPs & above.`);
        }
        return;
    }
};
