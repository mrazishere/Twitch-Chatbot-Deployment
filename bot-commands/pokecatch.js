/**
 * Pokemon catch command
 * 
 * Description: Catch pokemons on twitch chat
 * 
 * Credits: https://us-central1-caffs-personal-projects.cloudfunctions.net/pokeselect
 * 
 * Permission required: all users
 * 
 * Usage:   !pokecatch - Catch random pokemons
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.pokecatch = async function pokecatch(client, message, channel, tags) {
  input = message.split(" ");
  if (!input[1]) {
    const fetchResponse = await fetch('https://us-central1-caffs-personal-projects.cloudfunctions.net/pokeselect', { method: 'GET', headers: { 'accept': 'text/plain', 'content-type': 'text/plain' } })
      .then(response => {
        if (response.ok) {
          response.text().then((data) => {
            sleep(1000);
            output = data.slice(0, data.search("https"));
            client.say(channel, `@${tags.username}, ` + output);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      }).
      catch(error => {
        console.log(error);
      });
  } else {
    client.say(channel, "No input required, just do !pokecatch");
  }
  return;
}  