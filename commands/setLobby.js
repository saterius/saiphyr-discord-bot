const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { setVoiceLobby } = require("../services/guildConfigService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlobby")
    .setDescription("ตั้งช่องเสียงล็อบบี้ของเซิร์ฟเวอร์นี้")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("ช่องเสียงสำหรับล็อบบี้")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");

    await setVoiceLobby({
      guildId: interaction.guildId,
      lobbyChannelId: channel.id
    });

    await interaction.reply({
      content: `บันทึกช่องเสียงล็อบบี้ของเซิร์ฟเวอร์นี้แล้ว: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
