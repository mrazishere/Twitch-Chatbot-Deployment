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
- ✅ **Self-healing `sendChatMessageAPI`**: `401` reloads the token from disk and, if still stale, inline-refreshes via `client_credentials` before retrying. `429` backs off using `Ratelimit-Reset` and retries up to 3x. `5xx` and network errors retry with exponential backoff. `403` (and all exhausted retries) fall back to TMI.js IRC. IRC fallback preserves bot function without moderator status; Helix path preserves the Chat Bot Badge when available. Never throws on send failure — command dispatch also wraps each handler in try/catch so async rejections can't reach `unhandledRejection`. Bot user ID and app token are cached in-memory to eliminate per-message API calls.
- ✅ `!claude` post-processing no longer strips single-sentence answers that begin with phrases like "Here's…" / "Let me…"
- ✅ Smart 3-tier location detection (countries, states/provinces, cities)
- ✅ Automatic IANA timezone detection using `countries-and-timezones` and `city-timezones` libraries
- ✅ Weather command defaults to channel location
- ✅ Clock command uses location name from config
- ✅ Removed redundant `!settimezone` command (use `!config location set` instead)

## TODO:
- [X] Bot Management documentation
- [X] Commands documentation
- [X] Quick re-deploy (any changes to `new-template-hybrid-conduit.js` apply to all bots)
