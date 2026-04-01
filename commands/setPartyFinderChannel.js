const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { setPartyFinderChannel } = require("../services/guildConfigService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setpartyfinderchannel")
    .setDescription("Set the text channel used for /party create in this guild")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Text channel used for party recruitment")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");

    await setPartyFinderChannel({
      guildId: interaction.guildId,
      finderChannelId: channel.id
    });

    await interaction.reply({
      content: `Default party finder channel saved for this guild: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
