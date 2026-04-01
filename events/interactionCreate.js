const { MessageFlags } = require("discord.js")
const { handleComponentInteraction } = require("./interactionHandlers")
const ServiceError = require("../services/serviceError")

function getErrorMessage(error) {
  if (error instanceof ServiceError) {
    return error.message
  }

  return "เกิดข้อผิดพลาดระหว่างการทำงานของคำสั่ง"
}

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
      await command.execute(interaction, client)
    } catch (error) {
      console.error(error)
      const content = getErrorMessage(error)

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content,
          flags: MessageFlags.Ephemeral
        }).catch(() => null)
      } else {
        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral
        }).catch(() => null)
      }
    }
  }
}
