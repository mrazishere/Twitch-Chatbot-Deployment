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
    const isModUp = isBroadcaster || isMod || tags.username === process.env.TWITCH_OWNER;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1);
    input = message.split(" ");

    if (input[0] === "!snipecd") {
        if (isModUp) {
            if (countdownInterval) {
                client.say(channel, `@${tags.username}, there's already an ongoing countdown. Use !cancelcd to cancel it.`);
                return;
            }

            let cd = 10;
            if (input.length === 2 && !isNaN(input[1])) {
                cd = input[1];
            } else if (input.length !== 1) {
                client.say(channel, `@${tags.username}, invalid use of command: !snipecd or !snipecd [Number of Seconds]`);
                return;
            }

            client.say(channel, `Countdown starting in ${cd} seconds...`);
            cd = cd * 1000;

            countdownInterval = setInterval(async () => {
                cd -= 10000;
                if (cd >= 10000) {
                    client.say(channel, `Countdown starting in ${cd / 1000} seconds...`);
                } else {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    await sleep(cd);
                    client.say(channel, "Ready up on GO!");
                    await sleep(1000);
                    client.say(channel, "5");
                    await sleep(1000);
                    client.say(channel, "4");
                    await sleep(1000);
                    client.say(channel, "3");
                    await sleep(1000);
                    client.say(channel, "2");
                    await sleep(1000);
                    client.say(channel, "1");
                    await sleep(1000);
                    client.say(channel, "Let's Goooooooo!!");
                }
            }, 10000);

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
                client.say(channel, `Countdown canceled.`);
            } else {
                client.say(channel, `@${tags.username}, there's no ongoing countdown to cancel.`);
            }
        } else {
            client.say(channel, `@${tags.username}, !cancelcd is for Moderators & above.`);
        }
        return;
    }
};
