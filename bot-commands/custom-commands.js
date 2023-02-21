const fs = require('fs');

// Function to create custom commands and store them in a JSON file
exports.customCommands = async function customCommands(client, message, channel, tags) {
    // Set variables for user permission logic
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1); //channel name (i.e. username)

    // Check if the user is a mod or above
    if (!isModUp) {
        client.say(channel, `@${tags.username}, Custom Commands are for Moderators & above.`);
        return;
    }

    if (message.includes("!addcommand")) {
        // Check if the user is trying to add a command with a name that already exists
        if (message.includes("!addcommand " + commandName)) {
            client.say(channel, `@${tags.username}, That command already exists!`);
            return;
        } else {
            // Check if the user is trying to add a command without a name
            if (message.includes("!addcommand ")) {
                client.say(channel, `@${tags.username}, You need to specify a command name!`);
                return;
            } else {
                // Check if the user is trying to add a command without a response
                if (message.includes("!addcommand " + commandName + " ")) {
                    client.say(channel, `@${tags.username}, You need to specify a response!`);
                    return;
                } else {
                    // Check if the user is trying to add a command with a response that is too long
                    if (message.length > 100) {
                        client.say(channel, `@${tags.username}, Your response is too long!`);
                        return;
                    } else {
                        // Check if the user is trying to add a command with a name that is too long
                        if (commandName.length > 25) {
                            client.say(channel, `@${tags.username}, Your command name is too long!`);
                            return;
                        } else {
                            // Check if the user is trying to add a command with a name that is too short
                            if (commandName.length < 3) {
                                client.say(channel, `@${tags.username}, Your command name is too short!`);
                                return;
                            } else {
                                // Check if the user is trying to add a command with a name that is not alphanumeric
                                if (!commandName.match(/^[a-zA-Z0-9]+$/)) {
                                    client.say(channel, `@${tags.username}, Your command name must be alphanumeric!`);
                                    return;
                                } else {
                                    // Store the command in the JSON file
                                    const commandName = message.split("!addcommand ")[1].split(" ")[0];
                                    const commandResponse = message.split("!addcommand " + commandName + " ")[1];
                                    const command = {
                                        channel: channel1,
                                        commandName: commandName,
                                        commandResponse: commandResponse
                                    };
                                    const commandJSON = JSON.stringify(command);
                                    fs.appendFile(`${process.env.BOT_FULL_PATH}/bot-commands/custom-commands.json`, commandJSON + ");", function (err) {
                                        if (err) throw err;
                                        client.say(channel, `@${tags.username}, Command added!`);
                                        return;
                                        });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Path: bot-commands\custom-commands.js
    // Function to delete custom commands and remove them from the JSON file
    if (message.includes("!delcommand")) {
        // Check if the user is trying to delete a command with a name that does not exist
        if (!message.includes("!delcommand " + commandName)) {
            client.say(channel, `@${tags.username}, That command does not exist!`);
            return;
        } else {
            // Check if the user is trying to delete a command without a name
            if (message.includes("!delcommand ")) {
                client.say(channel, `@${tags.username}, You need to specify a command name!`);
                return;
            } else {
                // Delete the command from the JSON file
                const commandName = message.split("!delcommand ")[1];
                const command = {
                    channel: channel1,
                    commandName: commandName,
                    commandResponse: commandResponse
                };
                const commandJSON = JSON.stringify(command);
                fs.readFile(`${process.env.BOT_FULL_PATH}/bot-commands/custom-commands.json`, 'utf8', function (err, data) {
                    if (err) throw err;
                    var newValue = data.replace(commandJSON + ");", "");
                    fs.writeFile(`${process.env.BOT_FULL_PATH}/bot-commands/custom-commands.json`, newValue, 'utf8', function (err) {
                        if (err) throw err;
                        client.say(channel, `@${tags.username}, Command deleted!`);
                        return;
                    });
                });
            }
        }
    }

    // Function to edit custom commands and update them in the JSON file
    if (message.includes("!editcommand")) {
        // Check if the user is trying to edit a command with a name that does not exist
        if (!message.includes("!editcommand " + commandName)) {
            client.say(channel, `@${tags.username}, That command does not exist!`);
            return;
        } else {
            // Check if the user is trying to edit a command without a name
            if (message.includes("!editcommand ")) {
                client.say(channel, `@${tags.username}, You need to specify a command name!`);
                return;
            } else {
                // Check if the user is trying to edit a command without a response
                if (message.includes("!editcommand " + commandName + " ")) {
                    client.say(channel, `@${tags.username}, You need to specify a response!`);
                    return;
                } else {
                    // Check if the user is trying to edit a command with a response that is too long
                    if (message.length > 100) {
                        client.say(channel, `@${tags.username}, Your response is too long!`);
                        return;
                    } else {
                        // Check if the user is trying to edit a command with a name that is too long
                        if (commandName.length > 25) {
                            client.say(channel, `@${tags.username}, Your command name is too long!`);
                            return;
                        } else {
                            // Check if the user is trying to edit a command with a name that is too short
                            if (commandName.length < 3) {
                                client.say(channel, `@${tags.username}, Your command name is too short!`);
                                return;
                            } else {
                                // Check if the user is trying to edit a command with a name that is not alphanumeric
                                if (!commandName.match(/^[a-zA-Z0-9]+$/)) {
                                    client.say(channel, `@${tags.username}, Your command name must be alphanumeric!`);
                                    return;
                                } else {
                                    // Update the command in the JSON file
                                    const commandName = message.split("!editcommand ")[1].split(" ")[0];
                                    const commandResponse = message.split("!editcommand " + commandName + " ")[1];
                                    const command = {
                                        channel: channel1,
                                        commandName: commandName,
                                        commandResponse: commandResponse
                                    };
                                    const commandJSON = JSON.stringify(command);
                                    fs.readFile(`${process.env.BOT_FULL_PATH}/bot-commands/custom-commands.json`, 'utf8', function (err, data) {
                                        if (err) throw err;
                                        var newValue = data.replace(commandJSON + ");", "");
                                        fs.writeFile(`${process.env.BOT_FULL_PATH}/bot-commands/custom-commands.json`, newValue, 'utf8', function (err) {
                                            if (err) throw err;
                                            client.say(channel, `@${tags.username}, Command updated!`);
                                            return;
                                        });
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

