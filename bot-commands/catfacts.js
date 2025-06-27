/**
 * Cat Facts command
 * 
 * Description: Get random cat facts on twitch chat
 * 
 * Credits: https://meowfacts.herokuapp.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !catfacts - Random cat fact
 * 
 * TODO: add search functionality
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.catfacts = async function catfacts(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!catfacts") {
    try {
      const response = await fetch('https://meowfacts.herokuapp.com/', {
        method: 'GET',
        headers: { 'accept': 'application/json', 'content-type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        const output = data.data[0];

        await sleep(1000);

        if (!input[1]) {
          client.say(channel, `@${tags.username}, ${output}`);
        } else {
          client.say(channel, `@${tags.username}, this command does not accept any inputs.`);
        }
      } else {
        client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
      }
    } catch (error) {
      console.log(error);
      client.say(channel, "Sorry, there was an error getting cat facts.");
    }
    return;
  }
}