const { MessageFlags } = require("discord.js");
const { handleComponentInteraction } = require("./interactionHandlers");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) {
      await handleComponentInteraction(interaction);
      return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Error executing command",
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: "Error executing command",
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
