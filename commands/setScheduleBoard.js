const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { setScheduleBoard } = require("../services/guildConfigService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setscheduleboard")
    .setDescription("Set the default schedule board channel for this guild")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Text channel to use as the schedule board")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");

    await setScheduleBoard({
      guildId: interaction.guildId,
      boardChannelId: channel.id
    });

    await interaction.reply({
      content: `Default schedule board saved for this guild: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
