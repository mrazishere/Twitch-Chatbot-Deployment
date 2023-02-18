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

exports.countDown = async function countDown(client, channel, message, tags) {
    excludeAnnouncement = `${process.env.SNIPECD_EXCLUDE}`;
    input = message.split(" ");
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
    if (!excludeAnnouncement.includes(channel)) {
        client.mods(channel).then((data) => {
            if (data.includes(`${process.env.TWITCH_USERNAME}`)) {
                client.say(channel, "/announce Lets Goooooooo!!");
            } else {
                client.say(channel, "Lets Goooooooo!!");
            }
        }).catch((err) => {

        });
    } else {
        client.say(channel, "Lets Goooooooo!!");
    }
    return;
}