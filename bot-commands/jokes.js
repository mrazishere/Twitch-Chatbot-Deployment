/**
 * Jokes command
 * 
 * Description: Get random jokes on twitch chat
 * 
 * Credits: https://v2.jokeapi.dev/joke
 * 
 * Permission required: all users
 * 
 * Usage:   !jokes - Random jokes
 *          !jokes<SPACE>[SEARCH TERM] - Jokes with search term
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.jokes = async function jokes(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!jokes") {
    if (!input[1]) {
      const fetchResponse = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            response.json().then((data) => {
              var outputArr = JSON.parse(JSON.stringify(data));
              //console.log(outputArr);
              var type = outputArr['type'];
              var setup = outputArr['setup'];
              var delivery = outputArr['delivery'];
              var joke = outputArr['joke'];
              sleep(1000);
              if (type == "twopart") {
                client.say(channel, `@${tags.username}, ` + setup);
                sleep(3000);
                client.say(channel, delivery);
              } else {
                client.say(channel, `@${tags.username}, ` + joke);
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
    } else {
      const fetchResponse = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode&contains=' + input[1], { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            response.json().then((data) => {
              var outputArr = JSON.parse(JSON.stringify(data));
              //console.log(outputArr);
              var type = outputArr['type'];
              var setup = outputArr['setup'];
              var delivery = outputArr['delivery'];
              var joke = outputArr['joke'];
              var error = outputArr['error'];
              sleep(1000);
              if (error) {
                client.say(channel, "Sorry, nothing found with the search term: " + input[1]);
              } else {
                if (type == "twopart") {
                  client.say(channel, `@${tags.username}, ` + setup);
                  client.say(channel, delivery);
                } else {
                  client.say(channel, `@${tags.username}, ` + joke);
                }
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
    }
    return;
  }
}
