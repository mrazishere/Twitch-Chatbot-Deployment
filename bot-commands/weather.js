/**
 * Random advice command
 * 
 * Description: Get advice on twitch chat
 * 
 * Credits: https://developer.accuweather.com/apis
 * 
 * Permission required: all users
 * 
 * Usage:   !weather<SPACE>[SEARCH TERM] - Get weather of searched location
 * 
 *          
 *  
 */

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.weather = async function weather(client, message, channel, tags) {
  input = message.split(" ");
  if (input[0] === "!weather") {
    if (!input[1]) {
      client.say(channel, "Please enter a location to search for. Usage: !weather [SEARCH TERM]");
    } else {
      const inputLocation = input.slice(1).join(" ").replace(/\s+/g, "%20");
      const fetchResponse = await fetch('http://dataservice.accuweather.com/locations/v1/search?apikey=uxReC9vMmorVHPwIwPZB0q40MUAkS2qC&q=' + inputLocation, { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            return response.json().then((data) => { // return the outputArr value from the .then() block
              var outputArr = JSON.parse(JSON.stringify(data));
              locationKey = outputArr[0]['Key'];
              locationName = outputArr[0]['LocalizedName'];
              return outputArr;
            });
          } else {
            client.say(channel, "Sorry, API is unavailable right now. Please try again later.");
          }
        })
        .catch(error => {
          console.log(error);
        });
      const fetchResponse2 = await fetch('http://dataservice.accuweather.com/currentconditions/v1/' + locationKey + '?apikey=uxReC9vMmorVHPwIwPZB0q40MUAkS2qC', { method: 'GET', headers: { 'accept': 'application/json', 'content-type': 'application/json' } })
        .then(response => {
          if (response.ok) {
            response.json().then((data) => {
              var outputArr = JSON.parse(JSON.stringify(data));
              WeatherText = outputArr[0]['WeatherText'];
              Temperature = outputArr[0]['Temperature']['Metric']['Value'];
              WeatherLink = outputArr[0]['Link'];
              client.say(channel, `@${tags.username}, The current weather for ` + locationName + " is " + WeatherText + ", with a temperature of " + Temperature + " °C. For more information, visit " + WeatherLink);
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
  }
};