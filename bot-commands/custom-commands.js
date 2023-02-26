const fs = require('fs');
const {
    promisify
} = require('util');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

exports.customCommands = async function customCommands(client, message, channel, tags) {
    const badges = tags.badges || {};
    const isBroadcaster = badges.broadcaster;
    const isMod = badges.moderator;
    const isVIP = badges.vip;
    const isModUp = isBroadcaster || isMod || tags.username == `${process.env.TWITCH_OWNER}`;
    const isVIPUp = isVIP || isModUp;
    const channel1 = channel.substring(1);

    let customCommands = {};
    try {
        const data = await readFileAsync(`${process.env.BOT_FULL_PATH}/bot-commands/custom/${channel.replace('#', '')}.json`);
        customCommands = JSON.parse(data);
    } catch (err) {
        console.log("No custom commands found for this channel.");
    }

    function commandExists(commandName) {
        return customCommands.hasOwnProperty(commandName);
    }

    // Add command function that stores the commandName, modOnly, and commandResponse and the number of times it has been used and saves it to the JSON file
    function addCommand(commandName, modOnly, commandResponse, commandCounter) {
        if (commandExists(commandName)) {
            return `@${tags.username}, That command already exists!`;
        }
        var commandCounter = 0;
        customCommands[commandName] = [modOnly, commandResponse, commandCounter];

        try {
            writeFileAsync(`${process.env.BOT_FULL_PATH}/bot-commands/custom/${channel1}.json`, JSON.stringify(customCommands));
        } catch (err) {
            console.error(err);
        }

        return `@${tags.username}, Command added!`;
    }

    function removeCommand(commandName) {
        if (!commandExists(commandName)) {
            return `@${tags.username}, That command doesn't exist!`;
        }

        delete customCommands[commandName];

        try {
            writeFileAsync(`${process.env.BOT_FULL_PATH}/bot-commands/custom/${channel1}.json`, JSON.stringify(customCommands));
        } catch (err) {
            console.error(err);
        }

        return `@${tags.username}, Command removed!`;
    }

    // Retrieve the number of times a command has been used
    // Edit command function that stores the commandName, modOnly, and commandResponse but does not change the number of times it has been used and saves it to the JSON file
    function editCommand(commandName, modOnly, commandResponse, commandCounter) {
        if (!commandExists(commandName)) {
            return `@${tags.username}, That command does not exist!`;
        }

        customCommands[commandName] = [modOnly, commandResponse, commandCounter];

        try {
            writeFileAsync(`${process.env.BOT_FULL_PATH}/bot-commands/custom/${channel1}.json`, JSON.stringify(customCommands));
        } catch (err) {
            console.error(err);
        }

        if (input[0] === "!editcommand") {
            return `@${tags.username}, Command updated!`;
        }
    }

    input = message.split(" ");

    if (!isModUp && (input[0] === "!addcommand" || input[0] === "!editcommand" || input[0] === "!delcommand" || input[0] === "!clist")) {
        client.say(channel, `@${tags.username}, Custom Commands are for Moderators & above.`);
        return;
    }

    if (input[0] === "!addcommand") {
        const modOnly = input[1].toLowerCase();
        const commandName = input[2].toLowerCase();
        const commandResponse = input.slice(3).join(" ");

        // Check if the user is trying to add a command without a name
        if (commandName === "" || commandName === undefined) {
            client.say(channel, `@${tags.username}, You need to specify a command name!`);
            return;
        } else {
            // modOnly check
            if (modOnly != "n" && modOnly != "y" && modOnly != "v") {
                client.say(channel, `@${tags.username}, You need to specify whether this is modOnly(n/y/v) command`);
                return;
            } else {
                // Check if the user is trying to add a command without a response
                if (commandResponse === "" || commandResponse === undefined) {
                    client.say(channel, `@${tags.username}, You need to specify a response!`);
                    return;
                } else {
                    // Check if the user is trying to add a command with a response that is too long
                    if (commandResponse.length > 100) {
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
                                    const commandCounter = 0;
                                    // Add the command to the JSON file
                                    const response = addCommand(commandName, modOnly, commandResponse, commandCounter);
                                    client.say(channel, response);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }


    if (input[0] === "!editcommand") {
        const modOnly = input[1].toLowerCase();
        const commandName = input[2].toLowerCase();
        const commandResponse = input.slice(3).join(" ");

        // Check if the user is trying to edit a command with a name that does not exists
        if (!commandExists(commandName)) {
            client.say(channel, `@${tags.username}, That command does not exists!`);
            return;
        } else {
            // Check if the user is trying to edit a command without a name
            if (commandName === "" || commandName === undefined) {
                client.say(channel, `@${tags.username}, You need to specify a command name!`);
                return;
            } else {
                // modOnly check
                if (modOnly != "n" && modOnly != "y" && modOnly != "v") {
                    client.say(channel, `@${tags.username}, You need to specify whether this is modOnly(n/y/v) command`);
                    return;
                } else {
                    // Check if the user is trying to edit a command without a response
                    if (commandResponse === "" || commandResponse === undefined) {
                        client.say(channel, `@${tags.username}, You need to specify a response!`);
                        return;
                    } else {
                        // Check if the user is trying to edit a command with a response that is too long
                        if (commandResponse.length > 100) {
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
                                        const commandCounter = customCommands[commandName][2];
                                        // Edit the command and upload to JSON file
                                        const response = editCommand(commandName, modOnly, commandResponse, commandCounter);
                                        client.say(channel, response);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (input[0] === "!delcommand") {
        const commandName = input[1].toLowerCase();

        // Check if the user is trying to remove a command that doesn't exist
        if (!commandExists(commandName)) {
            client.say(channel, `@${tags.username}, That command doesn't exist!`);
            return;
        } else {
            // Remove the command from the JSON file
            const response = removeCommand(commandName);
            client.say(channel, response);
            return;
        }
    }

    // Create command to update commandCounter
    if (input[0] === "!updatecounter") {
        const commandName = input[1].toLowerCase();
        const commandCounterNew = Number(input[2]);

        // Check if the user is trying to update a command without a name
        if (commandName === "" || commandName === undefined) {
            client.say(channel, `@${tags.username}, You need to specify a command name!`);
            return;
        } else {
            // Check if the user is trying to update a command without a counter
            if (commandCounterNew === "" || commandCounterNew === undefined) {
                client.say(channel, `@${tags.username}, You need to specify a counter!`);
                return;
            } else {
                // Check if the user is trying to update a command with a counter that is not a full integer
                if (!Number.isInteger(commandCounterNew)) {
                    client.say(channel, `@${tags.username}, Your counter must be a number!`);
                    return;
                } else {
                    // Check if the user is trying to update a command that doesn't exist
                    if (!commandExists(commandName)) {
                        client.say(channel, `@${tags.username}, That command doesn't exist!`);
                        return;
                    } else {
                        const modOnly = customCommands[commandName][0];
                        const commandResponse = customCommands[commandName][1];
                        // Update the commandCounter
                        editCommand(commandName, modOnly, commandResponse, commandCounterNew);
                        client.say(channel, `@${tags.username}, Counter updated!`);
                        return;
                    }
                }
            }
        }
    }

    if (input[0] === "!clist") {
        // Get the list of custom commands
        const commandList = Object.keys(customCommands);
        // Check if there are any custom commands
        if (commandList.length === 0) {
            client.say(channel, `@${tags.username}, There are no custom commands!`);
            return;
        } else {
            // Send the list of custom commands to chat
            client.say(channel, `@${tags.username}, Custom Commands: "${commandList.join('", "')}"`);
            return;
        }
    }
    // Check if the user is trying to call a custom command
    // Get the number of times the command has been called and add 1
    if (commandExists(input[0].substring(1)) && input[0].startsWith('!')) {
        // Get the command value for the custom command
        const commandName = commandExists(input[0].substring(1));
        const modOnly = customCommands[input[0].substring(1)][0];
        const commandResponse = customCommands[input[0].substring(1)][1];

        const commandCounter = customCommands[input[0].substring(1)][2];
        commandCounterNew = commandCounter + 1;

        // Update the JSON file with the new commandUsed value
        editCommand(input[0].substring(1), modOnly, commandResponse, commandCounterNew);

        var response = customCommands[input[0].substring(1)][1];
        if (response.includes("$counter")) {
            response = response.replace("$counter", commandCounterNew);
        }

        // Check if the command is modOnly and the user is not a mod
        if (modOnly === "y") {
            if (isModUp) {
                client.say(channel, response);
                return;
            } else {
                //client.say(channel, `@${tags.username}, This command is modOnly!`);
                return;
            }
        } else if (modOnly === "v") {
            if (isVIPUp) {
                client.say(channel, response);
                return;
            } else {
                //client.say(channel, `@${tags.username}, This command is modOnly!`);
                return;
            }
        } else if (modOnly === "n") {
            client.say(channel, response);
            return;
        }
    }
}