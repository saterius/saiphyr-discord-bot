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
    .setDescription("ตั้งหมวดหมู่สำหรับสร้างห้องข้อความปาร์ตี้ใหม่")
    .addChannelOption(option =>
      option
        .setName("category")
        .setDescription("หมวดหมู่ที่จะให้ระบบสร้างห้องปาร์ตี้")
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
      content: `บันทึกหมวดหมู่ห้องปาร์ตี้ของเซิร์ฟเวอร์นี้แล้ว: ${category}`,
      flags: MessageFlags.Ephemeral
    });
  }
};
