/**
 * Ping command
 * 
 * Description: Sends a response to the user when they type !ping
 * 
 * 
 * Permission required: all users
 * 
 * Usage:   !ping
 * 
 *          
 *  
 */

exports.ping = async function ping(client, message, channel, tags) {
    input = message.split(" ");
    if (input[0] === "!ping") {
        client.say(channel, `pong!`);
        return;
    }
};