#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function refreshAppAccessToken() {
    try {
        console.log('Refreshing App Access Token...');

        const response = await axios.post('https://id.twitch.tv/oauth2/token', {
            client_id: process.env.TWITCH_CLIENTID,
            client_secret: process.env.TWITCH_CLIENTSECRET,
            grant_type: 'client_credentials'
        });

        const tokenData = {
            access_token: response.data.access_token,
            expires_in: response.data.expires_in,
            token_type: response.data.token_type,
            is_app_token: true,
            created_at: new Date().toISOString(),
            scope: []
        };

        const tokenPath = path.join(process.env.BOT_FULL_PATH, 'channel-configs', 'app-access-token.json');
        await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));

        console.log('✅ App Access Token refreshed successfully!');
        console.log(`   Token will expire in ${Math.round(response.data.expires_in / 86400)} days`);
        console.log(`   Created at: ${tokenData.created_at}`);

        return tokenData;
    } catch (error) {
        console.error('❌ Failed to refresh App Access Token:', error.message);
        if (error.response) {
            console.error('   Response status:', error.response.status);
            console.error('   Response data:', error.response.data);
        }
        throw error;
    }
}

refreshAppAccessToken()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
