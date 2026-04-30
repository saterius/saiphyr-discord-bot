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
    .setDescription("ตั้งช่องข้อความสำหรับใช้ /party create ในเซิร์ฟเวอร์นี้")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("ช่องข้อความสำหรับโพสต์รับสมาชิกปาร์ตี้")
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
      content: `บันทึกช่องรับสมาชิกปาร์ตี้ของเซิร์ฟเวอร์นี้แล้ว: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
