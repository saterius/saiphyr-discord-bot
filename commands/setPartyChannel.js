const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { setPartyChannelCategory } = require("../services/guildConfigService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setpartychannel")
    .setDescription("Set the category used for new party text channels")
    .addChannelOption(option =>
      option
        .setName("category")
        .setDescription("Category where party channels should be created")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const category = interaction.options.getChannel("category");

    await setPartyChannelCategory({
      guildId: interaction.guildId,
      categoryChannelId: category.id
    });

    await interaction.reply({
      content: `Default party channel category saved for this guild: ${category}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
