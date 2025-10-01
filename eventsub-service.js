// EventSub Service - Standalone PM2 service for managing all channel EventSub connections
require('dotenv').config();
const express = require('express');
const { CustomRewardsEventSubManager } = require('./custom-rewards-eventsub.js');
const { ConduitManager } = require('./conduit-manager.js');

const app = express();
const port = 3003;

// Middleware
app.use(express.json());

// Create EventSub manager instance
const eventSubManager = new CustomRewardsEventSubManager();

// Create Conduit manager instance
const conduitManager = new ConduitManager();

// Store chat clients for each channel (we'll need to get these somehow)
const chatClients = new Map();

function getTimestamp() {
    const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper function to load channel config
async function loadChannelConfig(channelName) {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const configPath = path.join(process.env.BOT_FULL_PATH, 'channel-configs', `${channelName}.json`);
        const configData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.log(`[${getTimestamp()}] error: Failed to load config for ${channelName}:`, error.message);
        return null;
    }
}

// Initialize EventSub for all enabled channels on startup
async function initializeAllChannels() {
    try {
        console.log(`[${getTimestamp()}] info: 🚀 Initializing EventSub for all enabled channels...`);
        
        const fs = require('fs').promises;
        const path = require('path');
        const configDir = path.join(process.env.BOT_FULL_PATH, 'channel-configs');
        
        // Get all channel config files
        const files = await fs.readdir(configDir);
        const channelFiles = files.filter(file => file.endsWith('.json') && file !== 'oauth.json');
        
        let initializedCount = 0;
        
        for (const file of channelFiles) {
            const channelName = file.replace('.json', '');
            const config = await loadChannelConfig(channelName);
            
            if (config && config.redemptionEnabled) {
                console.log(`[${getTimestamp()}] info: Initializing EventSub for ${channelName}...`);
                const success = await eventSubManager.initializeChannelEventSub(channelName, null);
                if (success) {
                    initializedCount++;
                    console.log(`[${getTimestamp()}] info: ✅ EventSub initialized for ${channelName}`);
                } else {
                    console.log(`[${getTimestamp()}] error: ❌ Failed to initialize EventSub for ${channelName}`);
                }
            } else {
                console.log(`[${getTimestamp()}] info: ⏭️ Skipping ${channelName} (redemptions disabled)`);
            }
        }
        
        console.log(`[${getTimestamp()}] info: 🎉 EventSub initialization complete: ${initializedCount} channels active`);
        
    } catch (error) {
        console.error(`[${getTimestamp()}] error: Failed to initialize channels:`, error.message);
    }
}

// API endpoint for oauth-service to trigger reconnections
app.post('/reconnect', async (req, res) => {
    try {
        const { channels } = req.body;
        
        if (!channels || !Array.isArray(channels)) {
            return res.status(400).json({ error: 'Invalid channels array' });
        }
        
        console.log(`[${getTimestamp()}] info: 🔄 Received reconnection request for channels: ${channels.join(', ')}`);
        
        const results = {};
        
        for (const channel of channels) {
            try {
                console.log(`[${getTimestamp()}] info: Reconnecting EventSub for ${channel}...`);
                
                // Stop existing EventSub for this channel
                await eventSubManager.stopChannelEventSub(channel);
                
                // Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Reinitialize with fresh token
                const success = await eventSubManager.initializeChannelEventSub(channel, null);
                
                results[channel] = {
                    success,
                    timestamp: new Date().toISOString()
                };
                
                if (success) {
                    console.log(`[${getTimestamp()}] info: ✅ EventSub reconnected for ${channel}`);
                } else {
                    console.log(`[${getTimestamp()}] error: ❌ EventSub reconnection failed for ${channel}`);
                }
                
            } catch (error) {
                console.log(`[${getTimestamp()}] error: Error reconnecting ${channel}:`, error.message);
                results[channel] = {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        }
        
        res.json({
            success: true,
            results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(`[${getTimestamp()}] error: Reconnection request failed:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Conduit management endpoints
app.get('/conduit', async (req, res) => {
    try {
        const conduit = await conduitManager.getOrCreateConduit();
        res.json({
            success: true,
            conduit,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${getTimestamp()}] error: Failed to get conduit:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/conduit/add-shard', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        console.log(`[${getTimestamp()}] info: Adding WebSocket shard for session: ${sessionId}`);

        const result = await conduitManager.addWebSocketShard(sessionId);

        res.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${getTimestamp()}] error: Failed to add WebSocket shard:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/conduit/verify', async (req, res) => {
    try {
        console.log(`[${getTimestamp()}] info: Verifying conduit...`);
        const conduit = await conduitManager.getOrCreateConduit();

        res.json({
            success: true,
            conduit,
            message: 'Conduit verified and ready',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${getTimestamp()}] error: Failed to verify conduit:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    const status = eventSubManager.getStatus();
    res.json({
        ...status,
        service: 'EventSub Manager',
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'EventSub Manager',
        timestamp: new Date().toISOString()
    });
});

// Start the server
app.listen(port, async () => {
    console.log(`[${getTimestamp()}] info: 🌐 EventSub Manager listening on port ${port}`);
    console.log(`[${getTimestamp()}] info: 🔗 Endpoints:`);
    console.log(`[${getTimestamp()}] info:   POST /reconnect        - Trigger EventSub reconnections`);
    console.log(`[${getTimestamp()}] info:   GET  /status           - Get EventSub status`);
    console.log(`[${getTimestamp()}] info:   GET  /health           - Health check`);
    console.log(`[${getTimestamp()}] info:   GET  /conduit          - Get current conduit`);
    console.log(`[${getTimestamp()}] info:   POST /conduit/add-shard - Add WebSocket shard (with self-healing)`);
    console.log(`[${getTimestamp()}] info:   POST /conduit/verify   - Verify conduit exists`);

    // Initialize all enabled channels
    await initializeAllChannels();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(`[${getTimestamp()}] info: 🛑 Shutting down EventSub Manager gracefully...`);
    await eventSubManager.stopAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(`[${getTimestamp()}] info: 🛑 Received SIGTERM, shutting down EventSub Manager...`);
    await eventSubManager.stopAll();
    process.exit(0);
});

console.log(`[${getTimestamp()}] info: 🚀 EventSub Manager starting...`);