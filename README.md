# Twitch-Chatbot-Deployment
This project allows deployment of Twitch chatbot for multiple channels running on dedicated node.js instances. Interested streamers can enrol by typing `!addme` on the Bot's chat and a new bot instance will be created automatically without any manual action by the bot owner. The bot will be functional almost instantly in the streamer's twitch channel.

## Features
- **Automatic enrolment/disenrolment** - Streamers can join via `!addme` or leave via `!removeme` from bot's chat
- **Smart location detection** - Supports countries, states/provinces, and cities globally with automatic timezone detection
- **Centralized bot commands** - All commands in `bot-commands/` folder, shared across all channels
- **Individual bot instances** - Each channel runs as a separate PM2 process (`twitch-{username}`)
- **Location-based features** - Weather and clock commands use channel's configured location
- **Hybrid architecture** - TMI.js for chat + EventSub conduits for advanced features

## Quick Reference
- **Template file**: `channels/new-template-hybrid-conduit.js`
- **PM2 rebuild guide**: `PM2-REBUILD-GUIDE.md`
- **Bot commands**: See `bot-commands/README.md`

### Check out the [Wiki](https://github.com/mrazishere/Twitch-Chatbot-Deployment/wiki) for installation & guide

## Recent Updates
- ✅ Smart 3-tier location detection (countries, states/provinces, cities)
- ✅ Automatic IANA timezone detection using `countries-and-timezones` and `city-timezones` libraries
- ✅ Weather command defaults to channel location
- ✅ Clock command uses location name from config
- ✅ Removed redundant `!settimezone` command (use `!config location set` instead)

## TODO:
- [X] Bot Management documentation
- [X] Commands documentation
- [X] Quick re-deploy (any changes to `new-template-hybrid-conduit.js` apply to all bots)
