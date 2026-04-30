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
    .setDescription("ตั้งช่องบอร์ดตารางเวลาหลักของเซิร์ฟเวอร์นี้")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("ช่องข้อความที่จะใช้เป็นบอร์ดตารางเวลา")
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
      content: `บันทึกช่องบอร์ดตารางเวลาของเซิร์ฟเวอร์นี้แล้ว: ${channel}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
