/**
 * Dad Jokes command
 * 
 * Description: Get random dad jokes on twitch chat
 * 
 * Credits: https://icanhazdadjoke.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !dad - Random dad jokes
 *          !dad<SPACE>[SEARCH TERM] - Dad jokes with search term
 * 
 *          
 *  
 */

//const fetch = require('node-fetch');  // import the fetch function
import fetch from 'node-fetch';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.dad = async function dad(client, message, channel, tags) {
  input = message.slice(5);
  if (input === "") {
    const fetchResponse = await fetch('https://icanhazdadjoke.com/', { method: 'GET', headers: { 'accept': 'text/plain', 'content-type': 'text/plain' } })
      .then(response => {
        if (response.ok) {
          response.text().then((data) => {
            sleep(1000);
            //console.log(data);
            client.say(channel, `@${tags.username}, ` + data);
            //console.log(data);
          });
        } else {
          client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
        }
      }).
      catch(error => {
        console.log(error);
      });
  } else {
    const fetchResponse = await fetch('https://icanhazdadjoke.com/search?term=' + input, { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
    .then(response => {
      if (response.ok) {
        response.json().then((data) => {
          var outputArr = JSON.parse(JSON.stringify(data));
          sleep(1000);
          if (outputArr['total_jokes'] == 0) {
            //console.log("No Jokes found");
            client.say(channel, "Sorry, nothing found with the search term: " + input);
          } else {
            var random = Math.floor(Math.random() * outputArr['results'].length);
            //console.log(outputArr['results'][random]['joke']);
            client.say(channel, `@${tags.username}, ` + outputArr['results'][random]['joke']);
          }
        });
      } else {
        client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
      }
    }).
    catch(error => {
      console.log(error);
    });
}
return;
}

