# Twitch-Chatbot-Deployment
This project allows deployment of Twitch chatbot for multiple channels running on dedicated node.js instances. Streamers can enrol by typing "!addme" on the Bot's chat and a new bot instance will be created automatically without any manual action by the bot owner. 


## Features
- Automatic enrolment/disenrolment from bot's chat(!addme / !removeme)
- Centralised bot commands files(bot-commands folder)
- Each bot instances can be managed easily with PM2
- Customizable code for individual bot instances(channels/ folder)


## How does it work?
1. Once deployed, the bot will listen for 2 commands(!addme & !removeme) in the bot's chat
    - Bot owner can set the maximum number of channels in the .env file
2. Using the new-template.js file, a new bot instance file will be created in the channels folder
    - the instance info will also be added to ecosystem.config.js file in the channels folder
3. PM2 will then start the bot instance afterwhich the bot will be ready for use
4. !removeme will send PM2 to power down the bot instance
    - Bot owner can manually delete the instance & remove from the ecosystem.config.js file


## TODO:
- [ ] Commands documentation
- [ ] Bot Management documentation


## Installation(Tested: Ubuntu/Debian)
Tested on Ubuntu 22.10 but should very well work with Debian and other Linux distros however installation steps may vary. If you have Windows and do not have access to a Linux system, you can now [Install Linux on Windows with WSL](https://learn.microsoft.com/en-us/windows/wsl/install)


- Install nvm & restart SSH session
```Shell
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash && exit
```
- Start a new SSH session & install latest stable Node.js version:
```Shell
nvm install node
```
- Upgrade npm & install PM2
```Shell
npm install -g npm@latest && npm install pm2 -g
```
- Update Apt and install git:
```Shell
sudo apt update && apt install git
```
- Clone the repo
```Shell
git clone https://github.com/mrazishere/Twitch-Chatbot-Deployment.git
```
- Change to working directory
```Shell
cd Twitch-Chatbot-Deployment
```
- Install the bot & dependencies
```Shell
npm install
```
- create .env file
```Shell
nano .env
```
- Copy below and modify accordingly
```YAML
# Twitch username of the bot
TWITCH_USERNAME = bot_username

# Generate OAuth token from https://twitchapps.com/tmi/
TWITCH_OAUTH = oauth:XXXXXXXXXXXXXXXXXXX

# Twitch API Token generator - https://twitchapps.com/tokengen/
# Create a Twitch app @ https://www.twitch.tv/kraken/oauth2/clients/new
TWITCH_CLIENTID = 
TWITCH_CLIENTSECRET = 
TWITCH_ACCESTOKEN = 
TWITCH_SCOPES = ["analytics:read:extensions","user:edit","user:read:email","clips:edit","bits:read","analytics:read:games","user:edit:broadcast","user:read:broadcast","chat:read","chat:edit","channel:moderate","channel:read:subscriptions","whispers:read","whispers:edit","moderation:read","channel:read:redemptions","channel:edit:commercial","channel:read:hype_train","channel:read:stream_key","channel:manage:extensions","channel:manage:broadcast","user:edit:follows","channel:manage:redemptions","channel:read:editors","channel:manage:videos","user:read:blocked_users","user:manage:blocked_users","user:read:subscriptions","user:read:follows","channel:manage:polls","channel:manage:predictions","channel:read:polls","channel:read:predictions","moderator:manage:automod","channel:manage:schedule","channel:read:goals","moderator:read:automod_settings","moderator:manage:automod_settings","moderator:manage:banned_users","moderator:read:blocked_terms","moderator:manage:blocked_terms","moderator:read:chat_settings","moderator:manage:chat_settings","channel:manage:raids","moderator:manage:announcements","moderator:manage:chat_messages","user:manage:chat_color","channel:manage:moderators","channel:read:vips","channel:manage:vips","user:manage:whispers"]
TWITCH_redirecturi = https://twitchapps.com/tokengen/

# Twitch username of Bot owner if different from the bot
# This is mostly to give access to commands without being a moderator of the channel
TWITCH_OWNER = <Twitch Username of Bot owner>

# Set the full path of the bot parent directory
BOT_FULL_PATH = /home/username/Twitch-Chatbot-Deployment

# Set maximum number of channels to allow
MAX_CHANNELS = 30

# Generate API token from https://funtranslations.com/api/ or disable !yoda command
API_FUNTRANSLATION_SECRET = 

# Snipe countdown will end with an announcement message if the bot has a moderator role
# Viewers on mobile may not be able to see anouncement messages, add #channel in array below to be excluded
# When excluded, countdown will be fully displayed in normal chat message
SNIPECD_EXCLUDE = ["#channel"]
```
- Start the Bot-Deployment-Manager
```Shell
pm2 start ecosystem.config.js
```
