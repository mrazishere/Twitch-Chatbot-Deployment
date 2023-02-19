/**
 * Number Facts command
 * 
 * Description: Get number facts on twitch chat
 * 
 * Credits: http://numbersapi.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !numfacts - Random Number facts
 *          !numfacts<SPACE>[number] - Get facts about a specific number
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.numfacts = async function numfacts(client, message, channel, tags) {
  input = message.split(" ");
  if (input.length > 2) {
    return;
  } else if (input.length == 2) {
    fetchResponse = await fetch('http://numbersapi.com/' + input[1] + '')
      .then(response => {
        if (response.ok) {
          response.text().then((data) => {
            sleep(1000);
            client.say(channel, `@${tags.username}, ` + data);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      })
      .catch(error => {
        console.log(error);
      });
  } else {
    fetchResponse = await fetch('http://numbersapi.com/random')
      .then(response => {
        if (response.ok) {
          response.text().then((data) => {
            sleep(1000);
            client.say(channel, `@${tags.username}, ` + data);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      })
      .catch(error => {
        console.log(error);
      });
  }
  return;
};
