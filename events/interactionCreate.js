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

module.exports = async (interaction, client) => {

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) return;

  try {

    await command.execute(interaction, client);

  } catch (error) {

    console.error(error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Error executing command", ephemeral: true });
    } else {
      await interaction.reply({ content: "Error executing command", ephemeral: true });
    }

  }

};