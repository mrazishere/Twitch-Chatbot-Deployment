/**
 * Dog Facts command
 * 
 * Description: Get Dog facts on twitch chat
 * 
 * Credits: https://dogapi.dog/docs/api-v2
 * 
 * Permission required: all users
 * 
 * Usage:   !dogfacts - Random dog fact
 * 
 * TODO: add search functionality
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.dogfacts = async function dogfacts(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!dogfacts") {
    const fetchResponse = await fetch('https://dogapi.dog/api/v2/facts', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            var output = outputArr['data'][0]['attributes']['body'];
            sleep(1000);
            if (!input[1]) {
              client.say(channel, `@${tags.username}, ` + output);
            } else {
              client.say(channel, `@${tags.username}, this command does not accept any inputs.`);
            }
          });
        } else {
          console.log(response)
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      }).
      catch(error => {
        console.log(error);
      });
    return;
  }
}
