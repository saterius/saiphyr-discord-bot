const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")

const { getScheduleConfig } = require("../services/guildConfigService")
const { syncGuildScheduleBoard } = require("../services/partyMessageService")
const ServiceError = require("../services/serviceError")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refreshscheduleboard")
    .setDescription("รีเฟรชข้อความบอร์ดตารางเวลาหลัก")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const scheduleConfig = await getScheduleConfig(interaction.guildId)

    if (!scheduleConfig?.board_channel_id) {
      throw new ServiceError(
        "ยังไม่ได้ตั้งค่าช่องบอร์ดตารางเวลา กรุณาใช้ /setscheduleboard ก่อน",
        "SCHEDULE_BOARD_NOT_CONFIGURED",
        { guildId: interaction.guildId }
      )
    }

    const message = await syncGuildScheduleBoard(client, interaction.guildId, scheduleConfig.board_channel_id)

    if (!message) {
      throw new ServiceError(
        "ไม่สามารถรีเฟรชบอร์ดตารางเวลาได้ กรุณาตรวจสอบช่องบอร์ดที่ตั้งค่าไว้",
        "SCHEDULE_BOARD_REFRESH_FAILED",
        { guildId: interaction.guildId, boardChannelId: scheduleConfig.board_channel_id }
      )
    }

    await interaction.editReply({
      content: `รีเฟรชบอร์ดตารางเวลาใน <#${scheduleConfig.board_channel_id}> แล้ว`
    })
  }
}
