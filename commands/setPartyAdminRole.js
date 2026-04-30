const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")
const { setPartyAdminRole } = require("../services/guildConfigService")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setpartyadminrole")
    .setDescription("ตั้งยศที่สามารถจัดการปาร์ตี้และตารางเวลาแทนหัวหน้าได้")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("ยศที่จัดการปาร์ตี้และตารางเวลาได้เหมือนแอดมิน")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const role = interaction.options.getRole("role")

    await setPartyAdminRole({
      guildId: interaction.guildId,
      adminRoleId: role.id
    })

    await interaction.reply({
      content: `บันทึกยศแอดมินปาร์ตี้สำหรับเซิร์ฟเวอร์นี้แล้ว: ${role}`,
      flags: MessageFlags.Ephemeral
    })
  }
}
