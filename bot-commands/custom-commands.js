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

    function addCommand(commandName, modOnly, commandResponse) {
        if (commandExists(commandName)) {
            return `@${tags.username}, That command already exists!`;
        }

        customCommands[commandName] = [modOnly, commandResponse];

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

    function editCommand(commandName, modOnly, commandResponse) {
        if (!commandExists(commandName)) {
            return `@${tags.username}, That command does not exist!`;
        }

        customCommands[commandName] = [modOnly, commandResponse];

        try {
            writeFileAsync(`${process.env.BOT_FULL_PATH}/bot-commands/custom/${channel1}.json`, JSON.stringify(customCommands));
        } catch (err) {
            console.error(err);
        }

        return `@${tags.username}, Command updated!`;
    }

    if (!isModUp && (message.split(" ")[0] === "!addcommand" || message.split(" ")[0] === "!editcommand" || message.split(" ")[0] === "!delcommand" || message.split(" ")[0] === "!clist")) {
        client.say(channel, `@${tags.username}, Custom Commands are for Moderators & above.`);
        return;
    }


    if (message.split(" ")[0] === "!addcommand") {
        const commandWords = message.split(" ");
        const modOnly = commandWords[1].toLowerCase();
        const commandName = commandWords[2].toLowerCase();
        const commandResponse = commandWords.slice(3).join(" ");

        // Check if the user is trying to add a command without a name
        if (commandName === "" || commandName === undefined) {
            client.say(channel, `@${tags.username}, You need to specify a command name!`);
            return;
        } else {
            // modOnly check
            if (modOnly != "t" && modOnly != "f") {
                client.say(channel, `@${tags.username}, You need to specify whether this is modOnly(t/f) command`);
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
                                    // Add the command to the JSON file
                                    const response = addCommand(commandName, modOnly, commandResponse);
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


    if (message.split(" ")[0] === "!editcommand") {
        const commandWords = message.split(" ");
        const modOnly = commandWords[1].toLowerCase();
        const commandName = commandWords[2].toLowerCase();
        const commandResponse = commandWords.slice(3).join(" ");

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
                if (modOnly != "t" && modOnly != "f") {
                    client.say(channel, `@${tags.username}, You need to specify whether this is modOnly(t/f) command`);
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
                                        // Edit the command and upload to JSON file
                                        const response = editCommand(commandName, modOnly, commandResponse);
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

    if (message.split(" ")[0] === "!delcommand") {
        const commandWords = message.split(" ");
        const commandName = commandWords[1].toLowerCase();

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
    if (message.split(" ")[0] === "!clist") {
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
    if (commandExists(message.substring(1)) && message.startsWith('!')) {
        // Get the modOnly value for the custom command
        const modOnly = customCommands[message.substring(1)][0];
        // Check if the command is modOnly and the user is not a mod
        if (modOnly === "t") {
            if (isModUp) {
                // Get the response for the custom command
                const response = customCommands[message.substring(1)][1];
                client.say(channel, response);
                return;
            } else {
                //client.say(channel, `@${tags.username}, This command is modOnly!`);
                return;
            }
        } else {
            // Get the response for the custom command
            const response = customCommands[message.substring(1)][1];
            // Send the response to chat
            client.say(channel, response);
            return;
        }
    }
}