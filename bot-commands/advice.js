/**
 * Random advice command
 * 
 * Description: Get random dad jokes on twitch chat
 * 
 * Credits: https://adviceslip.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !advice - Random advice
 *          !advice<SPACE>[SEARCH TERM] - Advice with search term
 * 
 *          
 *  
 */

//const fetch = require('node-fetch');  // import the fetch function
import fetch from 'node-fetch';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.advice = async function advice(client, message, channel, tags) {
  input = message.slice(8);
  if (input === "") {
    const fetchResponse = await fetch('https://api.adviceslip.com/advice', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            sleep(1000);
            client.say(channel, `@${tags.username}, ` + outputArr['slip']['advice']);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      })
      .catch(error => {
        console.log(error);
      });
  } else {
    const fetchResponse = await fetch('https://api.adviceslip.com/advice/search/' + input, { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            sleep(1000);
            if (outputArr.hasOwnProperty('slips')) {
              var random = Math.floor(Math.random() * outputArr['slips'].length);
              client.say(channel, `@${tags.username}, ` + outputArr['slips'][random]['advice']);
            } else {
              client.say(channel, "Sorry, nothing found with the search term: " + input);
            }
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