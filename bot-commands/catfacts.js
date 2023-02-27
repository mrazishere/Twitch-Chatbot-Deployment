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
    const fetchResponse = await fetch('https://meowfacts.herokuapp.com/', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            var output = outputArr['data'][0];
            sleep(1000);
            if (!input[1]) {
              //console.log(output);
              client.say(channel, `@${tags.username}, ` + output);
            } else {
              client.say(channel, `@${tags.username}, this command does not accept any inputs.`);
            }
            //console.log(data);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      }).
      catch(error => {
        console.log(error);
      });
    return;
  }
}