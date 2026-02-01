# Bot Commands Directory

All commands are centralized in this folder and shared across all bot instances.

## Command List

### Configuration & Management

> **Note:** All `!config` commands require Broadcaster or Bot Owner permissions

#### Bot Configuration Status
**Command:** `!config status`
- **Permission:** Broadcaster/Owner only
- **Description:** Display current bot configuration status
- **Shows:** Moderation status, chat mode, OAuth status, redemptions status, excluded commands count

#### Moderation Controls
**Commands:** `!config enable`, `!config disable`
- **Permission:** Broadcaster/Owner only
- **Description:** Enable or disable bot moderation features
- **Usage:**
  - `!config enable` - Enable moderation (bot acts as moderator)
  - `!config disable` - Disable moderation (chat-only mode)
- **Note:** Bot will automatically restart after changing moderation settings

**Command:** `!config modstatus`
- **Permission:** Broadcaster/Owner only
- **Description:** Check if bot has moderator status in the channel
- **Reminder:** Ensure bot has mod status with `/mod {botname}` for full functionality

#### Channel Point Redemptions
**Commands:** `!config redemption`, `!config redemption-status`
- **Permission:** Broadcaster/Owner only
- **Description:** Manage channel point redemption features (requires EventSub)
- **Usage:**
  - `!config redemption enable` - Enable redemption monitoring
  - `!config redemption disable` - Disable redemption monitoring
  - `!config redemption duration [seconds]` - Set timeout duration (max 14 days)
  - `!config redemption-status` - Check redemption status
- **Requirements:** Broadcaster OAuth setup at https://mr-ai.dev/auth
- **Note:** Bot will automatically restart after changing redemption settings

#### Special Users Management
**Command:** `!config special`
- **Permission:** Broadcaster/Owner only
- **Description:** Manage special users who get additional command permissions
- **Usage:**
  - `!config special add [username]` - Add user to special users list
  - `!config special remove [username]` - Remove user from special users list
  - `!config special list` - Show all special users
- **Use Case:** Grant specific users access to commands like `!snipecd` without making them moderators

#### Command Exclusion
**Command:** `!config exclude`
- **Permission:** Broadcaster/Owner only
- **Description:** Disable specific bot commands for your channel
- **Usage:**
  - `!config exclude add [commandname]` - Disable a command
  - `!config exclude remove [commandname]` - Re-enable a command
  - `!config exclude list` - Show all disabled commands
- **Examples:**
  - `!config exclude add jokes` - Disable the jokes command
  - `!config exclude remove dad` - Re-enable the dad jokes command

#### Location Configuration
**Command:** `!config location`
- **Permission:** Broadcaster/Owner only
- **Description:** Smart location detection supporting countries, states/provinces, and cities globally
- **Usage:**
  - `!config location set [location]` - Set your location
  - `!config location get` - Show current location
  - `!config location clear` - Clear location and timezone
- **Examples:**
  - `!config location set singapore` (country)
  - `!config location set california` (state)
  - `!config location set hanoi` (city)
- **Features:** Automatically sets IANA timezone for !clock command

---

### Custom Commands (User-Created)
**Command:** `!acomm`, `!ecomm`, `!dcomm`, `!lcomm`
- **Permission:** Moderators and above (management), All users (usage)
- **Description:** Create and manage custom commands directly from Twitch chat
- **Usage:**
  - `!acomm modOnly(n/y/v) commandName commandResponse` - Add new command
  - `!ecomm modOnly(n/y/v) commandName commandResponse` - Edit command
  - `!dcomm commandName` - Delete command
  - `!lcomm` - List all custom commands
- **modOnly Options:** n=all users, y=mods only, v=VIP and above

---

### Location-Based Commands

#### Clock
**Command:** `!clock`
- **Permission:** All users
- **Description:** Display current time based on channel's configured timezone
- **Requirements:** Location must be set via `!config location set [location]`
- **Features:** Uses location name from config (e.g., "Satun" instead of "Bangkok")
- **Credits:** [timeapi.io](https://www.timeapi.io/)

#### Weather
**Command:** `!weather [location]`
- **Permission:** All users
- **Description:** Get real-time weather information
- **Usage:**
  - `!weather` - Uses channel's configured location
  - `!weather tokyo` - Get weather for specific location
- **Features:** Defaults to channel location if not specified
- **Credits:** [OpenWeatherMap API](https://openweathermap.org/api)

#### Forex (Currency Exchange)
**Command:** `!forex [amount] [from] [to]`
- **Permission:** All users
- **Description:** Currency exchange rates with auto-conversion
- **Usage:**
  - `!forex 100 SGD MYR` - Convert 100 SGD to MYR
  - `!forex 100` - Auto-detect base currency from irl-location, convert to USD & SGD
- **Credits:** [ExchangeRate API](https://www.exchangerate-api.com/)

---

### Fun & Random Content

#### Random Advice
**Command:** `!advice [search term]`
- **Permission:** All users
- **Description:** Get random life advice
- **Usage:**
  - `!advice` - Random advice
  - `!advice love` - Advice about specific topic
- **Credits:** [AdviceSlip API](https://adviceslip.com/)

#### Anime Quotes
**Command:** `!anime`
- **Permission:** All users
- **Description:** Get random anime character quotes
- **Credits:** [AnimeChan API](https://animechan.vercel.app)

#### Cat Facts
**Command:** `!catfacts`
- **Permission:** All users
- **Description:** Get random cat facts
- **Credits:** [MeowFacts API](https://meowfacts.herokuapp.com/)

#### Dad Jokes
**Command:** `!dad [search term]`
- **Permission:** All users
- **Description:** Get random dad jokes
- **Usage:**
  - `!dad` - Random dad joke
  - `!dad pizza` - Dad joke about specific topic
- **Credits:** [icanhazdadjoke API](https://icanhazdadjoke.com/)

#### Dog Facts
**Command:** `!dogfacts`
- **Permission:** All users
- **Description:** Get random dog facts
- **Credits:** [Dog API](https://dogapi.dog/api/v1/facts)

#### Jokes
**Command:** `!jokes [search term]`
- **Permission:** All users
- **Description:** Get random jokes
- **Usage:**
  - `!jokes` - Random joke
  - `!jokes programming` - Jokes about specific topic
- **Credits:** [JokeAPI](https://v2.jokeapi.dev/joke)

#### Number Facts
**Command:** `!numfacts [number]`
- **Permission:** All users
- **Description:** Get interesting facts about numbers
- **Usage:**
  - `!numfacts` - Random number fact
  - `!numfacts 42` - Facts about specific number
- **Credits:** [Numbers API](https://numbersapi.com/)

---

### Utility Commands

#### Dictionary
**Command:** `!define [word]`
- **Permission:** All users
- **Description:** Get word definitions
- **Usage:** `!define serendipity`
- **Credits:** [Dictionary API](https://dictionaryapi.dev/)

#### Google Translate
**Command:** `![language code] [text]`
- **Permission:** All users
- **Description:** Translate text to specified language
- **Usage:** `!es Hello world` - Translate to Spanish
- **Language Codes:** [Google Translate Language Codes](https://cloud.google.com/translate/docs/languages)

#### Ping
**Command:** `!ping`
- **Permission:** All users
- **Description:** Check bot responsiveness and uptime
- **Response:** Shows bot status and uptime

---

### Countdown Timers

#### Multiple Countdowns
**Command:** `!countd`
- **Permission:** VIPs and above
- **Description:** Manage multiple named countdown timers
- **Usage:**
  - `!countd list` - List active countdowns
  - `!countd add [title] [duration]` - Start timer (e.g., `!countd add break 5m`)
  - `!countd edit [title] [duration]` - Edit existing timer
  - `!countd delete [title]` - Delete timer
- **Duration Format:** `30s` (seconds), `5m` (minutes), `2h` (hours)
- **Requirements:** Bot needs VIP or mod status for timing accuracy

#### Snipe Countdown
**Command:** `!snipecd [seconds]`, `!cancelcd`
- **Permission:** Special Users, Moderators and above
- **Description:** Simple countdown timer for snipe games
- **Usage:**
  - `!snipecd` - Start 10 second countdown
  - `!snipecd 30` - Start 30 second countdown
  - `!cancelcd` - Cancel ongoing countdown
- **Requirements:** Bot needs VIP or mod status for timing accuracy

---

### Games

#### Wordle
**Command:** `!wordle`
- **Permission:** Moderators+ to start, All users to play
- **Description:** Interactive Wordle game for Twitch chat
- **Usage:**
  - `!wordle start` - Start new game (mods only)
  - `!wordle guess [word]` - Make a 5-letter guess
  - `!wordle chars` - Show unused letters and wrong positions
  - `!wordle guesses` - Show all previous guesses
  - `!wordle stats` - Show game statistics
  - `!wordle help` - Show instructions
- **Features:** Uses curated word list with 522 answers and 12,651 valid guesses

#### Pokemon Catch
**Command:** `!catch`
- **Permission:** All users
- **Description:** Catch random Pokemon
- **Credits:** [PokeSelect API](https://us-central1-caffs-personal-projects.cloudfunctions.net/pokeselect)

#### Party Matchmaking
**Command:** `!mm`
- **Permission:** Moderators+ for management, All users to join
- **Description:** Random team matchmaking for playing with viewers
- **Usage:**
  - `!mm` - Show current matchmaking status
  - `!mm join` - Join the matchmaking queue
  - `!mm enable` - Enable matchmaking (mods only)
  - `!mm disable` - Disable matchmaking (mods only)
  - `!mm clear` - Clear queue (mods only)
  - `!mm random` - Randomize teams (mods only)
  - `!mm info` - Show detailed info (mods only)
- **Credits:** [twitch.tv/raaiined](https://twitch.tv/raaiined)

---

## API Credits

This bot uses the following free APIs:
- [AdviceSlip](https://adviceslip.com/) - Random advice
- [AnimeChan](https://animechan.vercel.app) - Anime quotes
- [Dictionary API](https://dictionaryapi.dev/) - Word definitions
- [Dog API](https://dogapi.dog/) - Dog facts
- [ExchangeRate API](https://www.exchangerate-api.com/) - Currency exchange
- [icanhazdadjoke](https://icanhazdadjoke.com/) - Dad jokes
- [JokeAPI](https://v2.jokeapi.dev/) - Various jokes
- [MeowFacts](https://meowfacts.herokuapp.com/) - Cat facts
- [Numbers API](https://numbersapi.com/) - Number facts
- [OpenWeatherMap](https://openweathermap.org/) - Weather data
- [TimeAPI](https://www.timeapi.io/) - Timezone information

## Libraries Used

- `countries-and-timezones` - Country and timezone detection
- `city-timezones` - City and state/province timezone mapping
- `googletrans` - Google Translate integration

## Notes

- Rate limiting is implemented on most commands to prevent API abuse
- Bot requires VIP or moderator status for countdown commands to work properly due to Twitch's chat cooldown
- Custom commands support three permission levels: all users (n), VIP+ (v), moderators+ (y)
