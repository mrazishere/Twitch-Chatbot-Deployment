/**
 * Twitch chat countdown command
 * 
 * Description: Allows streamers to start and cancel a countdown in the channel's chat.
 *              Some use purposes include: Snipe games.
 *              In order for the countdown to work, the bot needs to be at least a VIP or above due to Twitch's chat cooldown.
 * 
 * Permission required: Moderators and above
 * 
 * Usage:
 *   !snipecd - Start countdown in 10 seconds
 *   !snipecd [number of seconds] - Start countdown in 'n' seconds
 *   !cancelcd - Cancel the ongoing countdown
 */

let countdownInterval = null;
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.snipecd = async function snipecd(client, message, channel, tags) {
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = tags.isModUp || isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = tags.isVIPUp || isVIP || isModUp;
    const channel1 = channel.substring(1);
    let input = message.trimEnd().split(" ");

    if (input[0] === "!snipecd") {
        if (isModUp) {
            if (countdownInterval) {
                client.say(channel, `@${tags.username}, there's already an ongoing countdown. Use !cancelcd to cancel it.`);
                return;
            }

            let cd = 10;
            if (input.length === 2 && !isNaN(input[1])) {
                cd = parseInt(input[1], 10);
            } else if (input.length !== 1) {
                client.say(channel, `@${tags.username}, invalid use of command: !snipecd or !snipecd [Number of Seconds]`);
                return;
            }
            if (cd < 7) {
                cd = 7;
                client.say(channel, `Game starting in ${cd - 2} seconds...`);
            } else {
                client.say(channel, `Game starting in ${cd} seconds...`);
            }

            cd *= 1000; // Convert cd to milliseconds

            countdownInterval = setInterval(async () => {
                cd -= 1000;
                if (cd >= 10000 && cd % 10000 == 0) {
                    client.say(channel, `Game starting in ${cd / 1000} seconds...`);
                } else if (cd === 6000) {
                    client.say(channel, "Ready up on GO!");
                } else if (cd < 6000 && cd > 0) {
                    client.say(channel, `${cd / 1000}`);
                } else if (cd === 0) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    client.say(channel, "Let's Goooooooo!!");
                }
            }, 1000);
            return;
        } else {
            client.say(channel, `@${tags.username}, !snipecd is for Moderators & above.`);
            return;
        }
    } else if (input[0] === "!cancelcd") {
        if (isModUp) {
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                client.say(channel, `Countdown canceled! Look out for new countdown!`);
            } else {
                client.say(channel, `@${tags.username}, there's no ongoing countdown to cancel.`);
            }
        } else {
            client.say(channel, `@${tags.username}, !cancelcd is for Moderators & above.`);
        }
        return;
    }
};
