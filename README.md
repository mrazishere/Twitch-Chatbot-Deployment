# Twitch-Chatbot-Deployment
This project allows deployment of Twitch chatbot for multiple channels running on dedicated node.js instances. Interested streamers can enrol by typing `!addme` on the Bot's chat and a new bot instance will be created automatically without any manual action by the bot owner. The bot will be functional almost instantly in the streamer's twitch channel.

## Features
- Automatic enrolment/disenrolment from bot's chat(!addme / !removeme)
- Centralised bot commands files(bot-commands folder)
- Each bot instances can be managed easily with PM2
- Customizable code for individual bot instances(channels/ folder)

### Check out the [Wiki](https://github.com/mrazishere/Twitch-Chatbot-Deployment/wiki) for installation & guide

## TODO:
- [X] Bot Management documentation
- [ ] Commands documentation
- [ ] Quick re-deploy using new-template.js(for command changes)
