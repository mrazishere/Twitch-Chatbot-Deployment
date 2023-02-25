/**
 * Yoda translation command
 * 
 * Description: Translate text to Yoda language on twitch chat
 * 
 * Credits: https://funtranslations.com/yoda
 * 
 * Permission required: all users
 * 
 * Usage:   !yoda<SPACE>[Text to be translated]
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.yoda = async function yoda(client, message, channel, tags) {
  input = message.split(" ");
  if (!input[1]) {
    client.say(channel, 'No input provided, !yoda<SPACE>Text to be translated');
  } else {
    const fetchResponse = await fetch('http://api.funtranslations.com/translate/yoda?text=' + input[1], { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json', 'X-Funtranslations-Api-Secret': `${process.env.API_FUNTRANSLATION_SECRET}` } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            sleep(1000);
            client.say(channel, `@${tags.username}, ` + outputArr['contents']['translated']);
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