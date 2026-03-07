const fs = require("fs");
const path = require("path");

const commands = new Map();

const commandFiles = fs
    .readdirSync(path.join(__dirname, "../commands"))
    .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {

    const command = require(`../commands/${file}`);
    commands.set(command.data.name, command);
}

module.exports = async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) return;

    try {

        await command.execute(interaction);

    } catch (error) {

        console.error(error);

        if (interaction.replied || interaction.deferred) {
            interaction.followUp("Error executing command");
        } else {
            interaction.reply("Error executing command");
        }

    }
};