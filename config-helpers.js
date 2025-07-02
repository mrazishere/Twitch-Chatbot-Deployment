// config-helpers.js
const fs = require('fs').promises;
const path = require('path');

const CHANNELS_DIR = path.join(__dirname, 'channel-configs');

// SECURITY: Validate channel name to prevent path traversal attacks
function validateChannelName(channelName) {
    if (!channelName || typeof channelName !== 'string') {
        return false;
    }
    
    // Block obvious path traversal attempts
    if (channelName.includes('..') || channelName.includes('/') || channelName.includes('\\') || channelName.includes('\0')) {
        return false;
    }
    
    // Allow reasonable channel name lengths (preserve existing functionality)
    if (channelName.length > 100) {
        return false;
    }
    
    return true;
}

async function loadChannelConfig(channelName) {
    try {
        // SECURITY: Validate input to prevent path traversal
        if (!validateChannelName(channelName)) {
            return null; // Return null like ENOENT to preserve existing behavior
        }
        
        const configPath = path.join(CHANNELS_DIR, `${channelName}.json`);
        
        // SECURITY: Ensure path stays within intended directory
        const normalizedPath = path.resolve(configPath);
        const normalizedChannelsDir = path.resolve(CHANNELS_DIR);
        
        if (!normalizedPath.startsWith(normalizedChannelsDir)) {
            return null; // Return null like ENOENT to preserve existing behavior
        }
        
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