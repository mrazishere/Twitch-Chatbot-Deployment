const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// SECURITY: Basic rate limiting to prevent abuse
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per IP

function rateLimitMiddleware(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(clientIP)) {
        requestCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const clientData = requestCounts.get(clientIP);
    
    if (now > clientData.resetTime) {
        // Reset the window
        requestCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).send('Too many requests. Please try again later.');
    }
    
    clientData.count++;
    next();
}

// Apply rate limiting to API endpoints
app.use('/countd/data', rateLimitMiddleware);

// SECURITY: Validate channel name to prevent injection attacks
function validateChannelName(channelName) {
    if (!channelName || typeof channelName !== 'string') {
        return false;
    }
    
    // Block obvious attack attempts
    if (channelName.includes('..') || channelName.includes('/') || channelName.includes('\\') || channelName.includes('\0')) {
        return false;
    }
    
    // Allow reasonable channel name lengths (preserve existing functionality)
    if (channelName.length > 100) {
        return false;
    }
    
    return true;
}

// Serve the HTML file
app.get('/countd', (req, res) => {
    const htmlFilePath = path.join(__dirname, 'countd.html');
    res.sendFile(htmlFilePath);
});

// Provide the JSON data
app.get('/countd/data', (req, res) => {
    const channel = req.query.channel;

    if (!channel) {
        return res.status(400).send('Channel query parameter is required');
    }

    // SECURITY: Validate channel parameter to prevent attacks
    if (!validateChannelName(channel)) {
        return res.status(400).send('Invalid channel name format');
    }

    const filePath = path.join(__dirname, 'countd.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading countd.json:', err);
            return res.status(500).send('Error reading JSON file');
        }

        let countdData;
        try {
            countdData = JSON.parse(data);
        } catch (parseErr) {
            console.error('Error parsing countd.json:', parseErr);
            return res.status(500).send('Error parsing JSON file');
        }

        // SECURITY: Validate JSON structure
        if (!countdData || typeof countdData !== 'object') {
            console.error('Invalid countd.json structure: not an object');
            return res.status(500).send('Invalid data format');
        }

        try {
            // Filter and validate timer objects
            const timers = Object.values(countdData).filter(item => {
                // Basic validation of timer object structure
                if (!(item && 
                      typeof item === 'object' && 
                      typeof item.channel === 'string' && 
                      typeof item.title === 'string' &&
                      typeof item.startTime === 'number' &&
                      typeof item.duration === 'number')) {
                    return false;
                }
                
                // Normalize channel comparison (handle both "#channel" and "channel" formats)
                const itemChannel = item.channel.startsWith('#') ? item.channel.slice(1) : item.channel;
                const requestChannel = channel.startsWith('#') ? channel.slice(1) : channel;
                
                return itemChannel === requestChannel;
            });

            res.json(timers);
        } catch (filterErr) {
            console.error('Error filtering timer data:', filterErr);
            return res.status(500).send('Error processing data');
        }
    });
});

// Watch for changes in the countd.json file
const filePath = path.join(__dirname, 'countd.json');
fs.watch(filePath, (event) => {
    if (event === 'change') {
        console.log('countd.json file changed');
        // Notify clients (if needed) or perform actions on file change
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Node.js app listening at http://localhost:${port}`);
});
