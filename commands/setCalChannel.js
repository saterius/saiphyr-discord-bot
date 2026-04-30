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
    .setDescription("ตั้งช่องข้อความสำหรับใช้ /party cal ในเซิร์ฟเวอร์นี้")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("ช่องข้อความสำหรับโพสต์สรุปยอดคำนวณปาร์ตี้")
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
      content: `บันทึกช่องสรุปยอดคำนวณปาร์ตี้ของเซิร์ฟเวอร์นี้แล้ว: ${channel}`,
      flags: MessageFlags.Ephemeral
    })
  }
}
