// Conduit Manager - Centralized conduit management with self-healing
// Manages Twitch EventSub conduits for all bots

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

class ConduitManager {
    constructor() {
        this.conduitsFilePath = path.join(process.env.BOT_FULL_PATH, 'channel-configs', 'shared-conduits.json');
        this.appTokenPath = path.join(process.env.BOT_FULL_PATH, 'channel-configs', 'app-access-token.json');
    }

    getTimestamp() {
        const pad = (n, s = 2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
        const d = new Date();
        return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // Load app access token
    async loadAppAccessToken() {
        try {
            const data = await fsPromises.readFile(this.appTokenPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to load app access token:`, error.message);
            throw error;
        }
    }

    // Load current conduit from file
    async loadConduitFromFile() {
        try {
            if (fs.existsSync(this.conduitsFilePath)) {
                const data = await fsPromises.readFile(this.conduitsFilePath, 'utf8');
                const conduitsData = JSON.parse(data);
                if (conduitsData.conduits && conduitsData.conduits.length > 0) {
                    return conduitsData.conduits[0];
                }
            }
            return null;
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to load conduit from file:`, error.message);
            return null;
        }
    }

    // Save conduit to file
    async saveConduitToFile(conduit) {
        try {
            const conduitsData = {
                conduits: [conduit],
                lastUpdated: new Date().toISOString()
            };
            await fsPromises.writeFile(this.conduitsFilePath, JSON.stringify(conduitsData, null, 2));
            console.log(`[${this.getTimestamp()}] info: ✅ Saved conduit to file: ${conduit.id}`);
            return true;
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to save conduit to file:`, error.message);
            return false;
        }
    }

    // Verify conduit exists on Twitch
    async verifyConduitExists(conduitId) {
        try {
            const appToken = await this.loadAppAccessToken();

            const response = await axios.get('https://api.twitch.tv/helix/eventsub/conduits', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENTID,
                    'Authorization': `Bearer ${appToken.access_token}`
                }
            });

            const conduits = response.data.data;
            const exists = conduits.some(c => c.id === conduitId);

            console.log(`[${this.getTimestamp()}] info: Conduit ${conduitId} exists: ${exists}`);
            return exists;
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to verify conduit:`, error.message);
            return false;
        }
    }

    // Create new conduit on Twitch
    async createConduit() {
        try {
            const appToken = await this.loadAppAccessToken();

            const response = await axios.post('https://api.twitch.tv/helix/eventsub/conduits', {
                shard_count: 1
            }, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENTID,
                    'Authorization': `Bearer ${appToken.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            const newConduit = response.data.data[0];
            console.log(`[${this.getTimestamp()}] info: 🆕 Created new conduit: ${newConduit.id}`);

            // Save to file
            await this.saveConduitToFile(newConduit);

            return newConduit;
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to create conduit:`, error.message);
            throw error;
        }
    }

    // Get or create conduit with self-healing
    async getOrCreateConduit() {
        try {
            console.log(`[${this.getTimestamp()}] info: Getting conduit...`);

            // Load conduit from file
            let conduit = await this.loadConduitFromFile();

            if (!conduit) {
                console.log(`[${this.getTimestamp()}] info: No conduit found in file, creating new one...`);
                return await this.createConduit();
            }

            // Verify conduit exists on Twitch
            const exists = await this.verifyConduitExists(conduit.id);

            if (!exists) {
                console.log(`[${this.getTimestamp()}] warning: Conduit ${conduit.id} doesn't exist on Twitch, creating new one...`);
                return await this.createConduit();
            }

            console.log(`[${this.getTimestamp()}] info: ✅ Using existing conduit: ${conduit.id}`);
            return conduit;
        } catch (error) {
            console.error(`[${this.getTimestamp()}] error: Failed to get or create conduit:`, error.message);
            throw error;
        }
    }

    // Add WebSocket shard to conduit with self-healing
    async addWebSocketShard(sessionId) {
        try {
            // Get or create conduit (with self-healing)
            const conduit = await this.getOrCreateConduit();
            const appToken = await this.loadAppAccessToken();

            const response = await axios.patch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
                conduit_id: conduit.id,
                shards: [{
                    id: "0",
                    transport: {
                        method: "websocket",
                        session_id: sessionId
                    }
                }]
            }, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENTID,
                    'Authorization': `Bearer ${appToken.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[${this.getTimestamp()}] info: ✅ WebSocket shard added to conduit ${conduit.id}`);
            return { success: true, conduit };
        } catch (error) {
            // If 404, conduit was deleted - try to recreate and retry
            if (error.response && error.response.status === 404) {
                console.log(`[${this.getTimestamp()}] warning: 404 error - conduit deleted, recreating...`);

                try {
                    const newConduit = await this.createConduit();
                    const appToken = await this.loadAppAccessToken();

                    await axios.patch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
                        conduit_id: newConduit.id,
                        shards: [{
                            id: "0",
                            transport: {
                                method: "websocket",
                                session_id: sessionId
                            }
                        }]
                    }, {
                        headers: {
                            'Client-ID': process.env.TWITCH_CLIENTID,
                            'Authorization': `Bearer ${appToken.access_token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    console.log(`[${this.getTimestamp()}] info: ✅ Recovered: WebSocket shard added to new conduit ${newConduit.id}`);
                    return { success: true, conduit: newConduit };
                } catch (retryError) {
                    console.error(`[${this.getTimestamp()}] error: Failed to recover from 404:`, retryError.message);
                    throw retryError;
                }
            }

            console.error(`[${this.getTimestamp()}] error: Failed to add WebSocket shard:`, error.message);
            throw error;
        }
    }
}

module.exports = { ConduitManager };
