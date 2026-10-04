# Twitch-Chatbot-Deployment
This project allows deployment of Twitch chatbot for multiple channels running on dedicated node.js instances. Interested streamers can enrol by typing `!addme` on the Bot's chat and a new bot instance will be created automatically without any manual action by the bot owner. The bot will be functional almost instantly in the streamer's twitch channel.

## Features
- **Automatic enrolment/disenrolment** - Streamers can join via `!addme` or leave via `!removeme` from bot's chat
- **Smart location detection** - Supports countries, states/provinces, and cities globally with automatic timezone detection
- **Centralized bot commands** - All commands in `bot-commands/` folder, shared across all channels
- **Individual bot instances** - Each channel runs as a separate PM2 process (`twitch-{username}`)
- **Location-based features** - Weather and clock commands use channel's configured location
- **Hybrid architecture** - TMI.js for chat + EventSub conduits for advanced features
- **Web dashboard** - Streamers sign in with Twitch and manage their own bot from a web page instead of chat (see below)

## Web dashboard
Streamers sign in with their Twitch account at `https://<OAUTH_DOMAIN>/twitch` and manage their own channel. The bot owner (`TWITCH_OWNER`) and the bot account can manage any channel.

| Card | What it does |
|---|---|
| Bot status | Status, uptime, restarts and memory. Add the bot to the channel, restart it or remove it (the web version of `!addme` / `!removeme`) |
| Twitch connection | Connect, refresh or disconnect the streamer's Twitch account, with the granted permissions |
| Commands | Turn each command module on or off, and block single command words |
| Custom commands | Add, edit and delete custom commands, set who can use them and their counter |
| Moderation and channel | Moderation on/off, special users, location and timezone |
| Channel points | Timeout reward on/off, which reward, timeout length, restricted mode and its allowed users |
| Claude | A per-channel system prompt for `!claude` and `!research` |
| Overlay and games | Countdown overlay URL, active countdowns, Wordle games played (read-only) |
| Logs | The last 200 lines of that channel's bot log |

How it works:
- `dashboard-api.js` is a JSON API under `/twitch/api/bot`, mounted by `oauth-service.js` (the "OAuth Token Manager" PM2 process), which owns the Twitch login session. The page is `views/bot-dashboard.html`.
- Settings are written to `channel-configs/<channel>.json`, the same file `!config` writes. PM2 watches that file, so **saving settings, command toggles, channel points or the Claude prompt restarts that channel's bot** for a few seconds. Custom commands live in `bot-commands/custom/<channel>.json` and apply at once.
- A streamer can only read and change their own channel. Changes need a signed-in session and are rejected when sent from another site.
- Countdowns, Wordle and matchmaking are run from chat; the dashboard only shows countdowns and Wordle stats.

## Quick Reference
- **Template file**: `channels/new-template-hybrid-conduit.js`
- **PM2 rebuild guide**: `PM2-REBUILD-GUIDE.md`
- **Bot commands**: See `bot-commands/README.md`

### Check out the [Wiki](https://github.com/mrazishere/Twitch-Chatbot-Deployment/wiki) for installation & guide

## Recent Updates
- ✅ **Web dashboard** at `/twitch`: every `!config` setting, command toggles, custom commands, bot add/restart/remove and logs, replacing the old OAuth manager page
- ✅ **Per-channel Claude prompt**: `claudeSystemPrompt` in the channel config, set from the dashboard. `!system` still overrides it until the bot restarts and `!reset` returns to it
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
