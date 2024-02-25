/**
 * Currenct Exchange command
 * 
 * Description: Currency exchange command in twitch chat
 * 
 * Credits: https://www.exchangerate-api.com/
 * 
 * Permission required: all users
 * 
 * Usage:   !forex<SPACE>[Amount]<SPACE>[FromCurrency]<SPACE>[ToCurrency] - e.g: !forex 100 SGD MYR
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

API_KEY = `${process.env.API_EXCHANGERATE_API}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.forex = async function forex(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!forex") {
    if (input.length != 4) {
      client.say(channel, `@${tags.username}, invalid use of command: !forex<SPACE>[Amount]<SPACE>[FromCurrency]<SPACE>[ToCurrency]`);
    } else if (input.length == 4) {
      const fetchResponse = await fetch('https://v6.exchangerate-api.com/v6/' + API_KEY + '/pair/' + input[2] + '/' + input[3] + '/' + input[1], { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            response.json().then((data) => {
              var outputArr = JSON.parse(JSON.stringify(data));
              var output1 = outputArr['conversion_result'];
              var output2 = outputArr['time_last_update_utc'];
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
}