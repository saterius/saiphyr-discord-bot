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
    .setDescription("Refresh the central schedule board message")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const scheduleConfig = await getScheduleConfig(interaction.guildId)

    if (!scheduleConfig?.board_channel_id) {
      throw new ServiceError(
        "Schedule board channel is not configured. Please use /setscheduleboard first.",
        "SCHEDULE_BOARD_NOT_CONFIGURED",
        { guildId: interaction.guildId }
      )
    }

    const message = await syncGuildScheduleBoard(client, interaction.guildId, scheduleConfig.board_channel_id)

    if (!message) {
      throw new ServiceError(
        "Could not refresh the schedule board. Please check the configured board channel.",
        "SCHEDULE_BOARD_REFRESH_FAILED",
        { guildId: interaction.guildId, boardChannelId: scheduleConfig.board_channel_id }
      )
    }

    await interaction.editReply({
      content: `Schedule board refreshed in <#${scheduleConfig.board_channel_id}>.`
    })
  }
}
