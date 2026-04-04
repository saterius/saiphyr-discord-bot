const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")

const { setCalChannel } = require("../services/guildConfigService")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setcalchannel")
    .setDescription("Set the text channel used for /party cal in this guild")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Text channel used for party calculation summaries")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel")

    await setCalChannel({
      guildId: interaction.guildId,
      calChannelId: channel.id
    })

    await interaction.reply({
      content: `Default party calculation channel saved for this guild: ${channel}`,
      flags: MessageFlags.Ephemeral
    })
  }
}
