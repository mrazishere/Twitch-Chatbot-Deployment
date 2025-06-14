// config-helpers.js
const fs = require('fs').promises;
const path = require('path');

const CHANNELS_DIR = path.join(__dirname, 'channel-configs');

async function loadChannelConfig(channelName) {
    try {
        const configPath = path.join(CHANNELS_DIR, `${channelName}.json`);
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

module.exports = { loadChannelConfig };