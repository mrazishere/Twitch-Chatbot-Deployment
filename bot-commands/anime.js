/**
 * Random Anime Quotes command
 * 
 * Description: Get Anime quotes on twitch chat
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

const fetch = require('node-fetch');  // import the fetch function

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.anime = async function anime(client, message, channel, tags) {
  const input = message.split(" ");
  if (input[0] === "!anime") {
    return; // Silently disabled due to API issues
  }
};