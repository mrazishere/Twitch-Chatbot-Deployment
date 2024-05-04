const fs = require('fs');
const path = require('path');

const COUNTDOWN_FILE = path.join(__dirname, '..', 'countd.json');

// Function to read countdown data from JSON file
function readCountdownsFromFile() {
    try {
        const data = fs.readFileSync(COUNTDOWN_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Function to write countdown data to JSON file
function writeCountdownsToFile(countdowns) {
    fs.writeFileSync(COUNTDOWN_FILE, JSON.stringify(countdowns, null, 2), 'utf8');
}

let countdowns = readCountdownsFromFile();

let countdownIDCounter = 1; // Counter for generating unique countdown IDs

exports.countd = async function countd(client, message, channel, tags) {
    // Function to add a new countdown
    function addCountdown(client, channel, tags, params) {
        const args = params.split(" ");
        const title = args.shift(); // Extract the title from the arguments
        const durationStr = args.shift(); // Extract the duration string from the arguments
        const unit = durationStr.slice(-1); // Get the last character to determine the unit
        const duration = parseInt(durationStr.slice(0, -1)); // Get the duration without the unit

        if (!title || isNaN(duration) || !unit || (unit !== 's' && unit !== 'm') || durationStr.includes('min')) {
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

        startCountdown(client, channel, tags, title, cd, countdownID, startTime); // Pass the countdown ID and start time to startCountdown

        // Add the countdown to the active countdowns with start time
        countdowns[countdownID] = { channel, title, duration: cd, startTime };
        writeCountdownsToFile(countdowns); // Write the updated countdowns to the file
    }

    async function startCountdown(client, channel, tags, title, cd, countdownID, startTime) {
        console.log("Start Countdown called. Title:", title, "Start Time:", startTime); // Debugging statement
        client.say(channel, `Countdown "${title}" ending in ${formatTime(cd)}...`);

        const intervals = [60, 30, 5, 4, 3, 2, 1];

        let intervalIndex = 0;

        let countdownInterval = setInterval(async () => {
            if (cd >= 600 && cd % 600 === 0) {
                client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
            } else if (cd == 300) {
                client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
            } else if (cd <= intervals[intervalIndex]) {
                client.say(channel, `Countdown "${title}" - ${formatTime(cd)} remaining...`);
                intervalIndex++;
            }

            cd -= 1;

            if (cd === 0) {
                clearInterval(countdownInterval);
                client.say(channel, `Countdown "${title}" - Time's Up!`);

                // Remove the countdown from the active countdowns
                delete countdowns[countdownID];
                writeCountdownsToFile(countdowns);
            }
        }, 1000);

        // Add the countdown to the active countdowns with startTime
        countdowns[countdownID] = { channel, title, duration: cd, startTime, interval: countdownInterval };
        console.log("Countdown added. Title:", title, "Start Time:", startTime); // Debugging statement

        return startTime; // Return startTime
    }


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
                console.log("Countdown:", countdown.title, "Start Time:", countdown.startTime, "Current Time:", currentTime); // Debugging statement
                const elapsedTime = currentTime - countdown.startTime;
                console.log("Elapsed Time:", elapsedTime); // Debugging statement
                const remainingTime = Math.max(countdown.duration - elapsedTime, 0);
                console.log("Remaining Time:", remainingTime); // Debugging statement
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
            client.say(channel, `Countdown "${title}" removed.`);
        } else {
            client.say(channel, `@${tags.username}, countdown "${title}" not found.`);
        }
        writeCountdownsToFile(countdowns);
    }

    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1);
    let input = message.split(" ");

    if (input[0] === "!countd") {
        if (input[1] === "list") {
            // List active countdowns
            // First, start the countdown if adding a new one and then list countdowns
            if (input[2] === "add") {
                addCountdown(client, channel, tags, input.slice(3).join(" "));
                listCountdowns(client, channel, tags);
            } else {
                listCountdowns(client, channel, tags);
            }
        } else if (isModUp) {
            if (input[1] === "add") {
                // Add a new countdown
                addCountdown(client, channel, tags, input.slice(2).join(" "));
            } else if (input[1] === "remove") {
                // Remove a countdown
                removeCountdown(client, channel, tags, input.slice(2).join(" "));
            } else {
                client.say(channel, `@${tags.username}, invalid usage of command.`);
            }
        } else {
            client.say(channel, `@${tags.username}, !countd commands are for Moderators & above.`);
        }
        return;
    }
};
