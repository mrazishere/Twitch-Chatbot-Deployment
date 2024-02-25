/**
 * Dictionary command
 * 
 * Description: Get word definitions on twitch chat
 * 
 * Credits: https://dictionaryapi.dev/
 * 
 * Permission required: all users
 * 
 * Usage:   !define<SPACE>[SEARCH TERM] - Get definition of search term
 *          
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.dictionary = async function dictionary(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!define") {
    if (!input[1]) {
      client.say(channel, 'No input provided, !define<SPACE>Text to be defined');
    } else {
      const fetchResponse = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + input[1], { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            response.json().then((data) => {
              var outputArr = JSON.parse(JSON.stringify(data));
              sleep(1000);
              if (outputArr.length > 0) {
                var random = Math.floor(Math.random() * outputArr[0]['meanings'][0]['definitions'].length);
                definition1 = outputArr[0]['meanings'][0]['definitions'][0]['definition']
                client.say(channel, `@${tags.username}, ` + definition1);
              } else {
                client.say(channel, "Sorry, nothing found with the search term: " + input[1]);
              }
            });
          } else {
            client.say(channel, "Sorry, nothing found with the search term: " + input[1]);
          }
        })
        .catch(error => {
          console.log(error);
        });
    }
    return;
  }
};