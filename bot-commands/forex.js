/**
 * Currenct Exchange command
 * 
 * Description: Currency exchange command in twitch chat
 * 
 * Credits: https://exchangerate.host/
 * 
 * Permission required: all users
 * 
 * Usage:   !forex<SPACE>[Amount]<SPACE>[FromCurrency]<SPACE>[ToCurrency] - e.g: !forex 100 SGD MYR
 * 
 *          
 *  
 */

//const fetch = require('node-fetch');  // import the fetch function
import fetch from 'node-fetch';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.forex = async function forex(client, message, channel, tags) {
  input = message.split(" ");
  if (input.length != 4) {
    client.say(channel, `@${tags.username}, invalid use of command: !forex<SPACE>[Amount]<SPACE>[FromCurrency]<SPACE>[ToCurrency]`);
  } else if (input.length == 4) {
    const fetchResponse = await fetch('https://api.exchangerate.host/convert?from=' + input[2] + '&to=' + input[3] + '&amount=' + input[1], { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
      .then(response => {
        if (response.ok) {
          response.json().then((data) => {
            var outputArr = JSON.parse(JSON.stringify(data));
            var output1 = outputArr['result'];
            var output2 = outputArr['date'];
            sleep(1000);
            //console.log(input[2] + input[1] + ' = ' + input[3] + output1 + '. Last updated: ' + output2);
            client.say(channel, input[2] + input[1] + ' = ' + input[3] + output1 + '. Last updated: ' + output2);
            //console.log(data);
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