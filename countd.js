const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

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

    const filePath = path.join(__dirname, 'countd.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading JSON file');
        }

        let countdData;
        try {
            countdData = JSON.parse(data);
        } catch (parseErr) {
            return res.status(500).send('Error parsing JSON file');
        }

        const timers = Object.values(countdData).filter(item => item.channel === `#${channel}`);

        res.json(timers);
    });
});

// Watch for changes in the countd.json file
const filePath = path.join(__dirname, 'countd.json');
fs.watch(filePath, (event, filename) => {
    if (event === 'change') {
        console.log('countd.json file changed');
        // Notify clients (if needed) or perform actions on file change
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Node.js app listening at http://localhost:${port}`);
});
