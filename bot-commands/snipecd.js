/**
 * Twitch chat countdown command
 * 
 * Description: Allows streamers to start a countdown on channel's chat.
 *              Some use purpose includes: Snipe games.
 * 
 * Permission required: Moderators and above
 * 
 * Usage:   !snipecd - Start countdown in 10 seconds
 *          !snipecd<SPACE>[number of seconds] - Start countdown in 'n' seconds
 *          
 *  
 */

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.snipecd = async function snipecd(client, message, channel, tags) {
    // Set variables for user permission logic
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1); //channel name (i.e. username)
    input = message.split(" ");
    if (input[0] === "!snipecd") {
        if (isModUp) {
            cd = 10;
            if (input.length == 2 && !isNaN(input[1])) {
                cd = input[1];
            } else if (input.length == 1) {
                cd = 10;
            } else {
                client.say(channel, `@${tags.username}, invalid use of command: !snipecd or !snipecd<SPACE>[Number of Seconds]`);
                return;
            }
            client.say(channel, `Countdown starting in ` + cd + ` seconds`);
            cd = cd * 1000;
            await sleep(cd);
            client.say(channel, `Ready up on GO!`);
            await sleep(1000);
            client.say(channel, `5`);
            await sleep(1000);
            client.say(channel, `4`);
            await sleep(1000);
            client.say(channel, `3`);
            await sleep(1000);
            client.say(channel, `2`);
            await sleep(1000);
            client.say(channel, `1`);
            await sleep(1000);
            client.say(channel, "Lets Goooooooo!!");
            return;
        } else {
            client.say(channel, `@${tags.username}, !snipecd is for Moderators & above.`);
            return;
        }
    }
}