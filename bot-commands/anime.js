/**
 * Random Anime Quotes command
 * 
 * Description: Get random cat facts on twitch chat
 * 
 * Credits: https://animechan.vercel.app
 * 
 * Permission required: all users
 * 
 * Usage:   !anime - Random Anime Quotes
 * 
 * TODO: add search functionality
 *          
 *  
 */

//const fetch = require('node-fetch');  // import the fetch function
import fetch from 'node-fetch';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.anime = async function anime(client, message, channel, tags) {
  input = message.slice(7);
  const fetchResponse = await fetch('https://animechan.vercel.app/api/random', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
    .then(response => {
      if (response.ok) {
        response.json().then((data) => {
          var outputArr = JSON.parse(JSON.stringify(data));
          var output1 = outputArr['anime'];
          var output2 = outputArr['character'];
          var output3 = outputArr['quote'];
          sleep(1000);
          if (input === "") {
            client.say(channel, `@${tags.username}, ` + output3 + " ~ " + output2 + " from " + output1);
          } else {
            client.say(channel, `@${tags.username}, this command does not accept any inputs.`);
          }
        });
      } else {
        client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
      }
    })
    .catch(error => {
      console.log(error);
    });
  return;
};