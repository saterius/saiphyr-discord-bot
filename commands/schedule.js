const {
  MessageFlags,
  SlashCommandBuilder
} = require("discord.js")

const partyService = require("../services/partyService")
const scheduleService = require("../services/scheduleService")
const { getScheduleConfig } = require("../services/guildConfigService")
const ServiceError = require("../services/serviceError")
const {
  refreshScheduleVoteMessage,
  syncGuildScheduleBoard
} = require("../services/partyMessageService")
const {
  buildScheduleActionRows,
  buildScheduleEmbed
} = require("../utils/partyUi")

function ensurePartyChannel(interaction, party) {
  if (!party) {
    throw new ServiceError(
      "ใช้คำสั่ง /schedule ได้แค่ในช่องของปาร์ตี้เท่านั้น.",
      "INVALID_SCHEDULE_CHANNEL",
      { actualChannelId: interaction.channelId }
    )
  }
}

async function resolvePartyFromChannel(interaction) {
  const party = await partyService.getPartyByChannelId(interaction.channelId)
  ensurePartyChannel(interaction, party)
  return party
}

function buildBangkokUnixTimestamp(year, month, day, hour, minute) {
  const utcMillis = Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0)
  const bangkokDate = new Date(utcMillis + (7 * 60 * 60 * 1000))

  if (
    bangkokDate.getUTCFullYear() !== year ||
    bangkokDate.getUTCMonth() !== month - 1 ||
    bangkokDate.getUTCDate() !== day ||
    bangkokDate.getUTCHours() !== hour ||
    bangkokDate.getUTCMinutes() !== minute
  ) {
    throw new ServiceError(
      "รูปแบบของวันที่หรือเวลาไม่ถูกต้อง. กรุณาตรวจสอบอีกครั้ง.",
      "INVALID_SCHEDULE_DATETIME",
      { year, month, day, hour, minute }
    )
  }

  return Math.floor(utcMillis / 1000)
}

function formatBangkokDateText(year, month, day, hour, minute) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (Asia/Bangkok)`
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("จัดการโหวตตารางของปาร์ตี้")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("สร้างโหวตตารางเวลาสำหรับปาร์ตี้")
        .addIntegerOption((option) =>
          option
            .setName("year")
            .setDescription("ปี (ค.ศ.)")
            .setMinValue(2025)
            .setMaxValue(2100)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("month")
            .setDescription("เดือน")
            .setMinValue(1)
            .setMaxValue(12)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("day")
            .setDescription("วันที่")
            .setMinValue(1)
            .setMaxValue(31)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("hour")
            .setDescription("ชั่วโมง")
            .setMinValue(0)
            .setMaxValue(23)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("minute")
            .setDescription("นาที")
            .setMinValue(0)
            .setMaxValue(59)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("หมายเหตุสำหรับตารางเวลานี้")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("แสดงตารางเวลาของปาร์ตี้")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("ยกเลิกการนัดตารางเวลา")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่ยกเลิก")
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const year = interaction.options.getInteger("year")
      const month = interaction.options.getInteger("month")
      const day = interaction.options.getInteger("day")
      const hour = interaction.options.getInteger("hour")
      const minute = interaction.options.getInteger("minute")
      const description = interaction.options.getString("description")
      const party = await resolvePartyFromChannel(interaction)
      const scheduleConfig = await getScheduleConfig(interaction.guildId)

      if (!scheduleConfig?.board_channel_id) {
        throw new ServiceError(
          "ยังไม่ได้เลือกแชนแนลสำหรับช่องตารางเวลา. โปรดแจ้งผู้ดูแลให้ตั้งค่า /setscheduleboard ก่อน.",
          "SCHEDULE_BOARD_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      const resolvedBoardChannelId = scheduleConfig.board_channel_id
      const startAtUnix = buildBangkokUnixTimestamp(year, month, day, hour, minute)
      const proposedStartAt = formatBangkokDateText(year, month, day, hour, minute)

      const event = await scheduleService.createScheduleEvent({
        partyId: party.id,
        creatorId: interaction.user.id,
        title: party.name,
        description,
        proposedStartAt,
        proposedEndAt: null,
        startAtUnix,
        endAtUnix: null,
        sourceChannelId: interaction.channelId,
        boardChannelId: resolvedBoardChannelId
      })

      const voteMessage = await interaction.channel.send({
        content: party.party_role_id ? `<@&${party.party_role_id}>` : `Party ${party.name}`,
        embeds: [buildScheduleEmbed(event, party)],
        components: buildScheduleActionRows(event)
      })

      await scheduleService.updateScheduleMessages({
        eventId: event.id,
        sourceChannelId: interaction.channelId,
        voteMessageId: voteMessage.id,
        boardChannelId: resolvedBoardChannelId
      })

      await interaction.editReply({
        content: `ตารางเวลา #${event.id} ถูกสร้างแล้ว. บอร์ด: <#${resolvedBoardChannelId}>`
      })

      return
    }

    if (subcommand === "show") {
      const party = await resolvePartyFromChannel(interaction)
      const event = await scheduleService.getLatestScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ยังไม่มีการนัดตารางเวลา.",
          "SCHEDULE_NOT_FOUND",
          { partyId: party.id }
        )
      }

      await interaction.reply({
        embeds: [buildScheduleEmbed(event, party)],
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "cancel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const reason = interaction.options.getString("reason") || "Cancelled manually."
      const party = await resolvePartyFromChannel(interaction)
      const event = await scheduleService.getVotingScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ไม่มีการนัดตารางเวลาที่ต้องการยกเลิก.",
          "SCHEDULE_NOT_FOUND",
          { partyId: party.id }
        )
      }

      await scheduleService.cancelScheduleEvent({
        eventId: event.id,
        actorId: interaction.user.id,
        reason
      })

      await refreshScheduleVoteMessage(interaction.client, event.id)
      await syncGuildScheduleBoard(interaction.client, interaction.guildId)

      await interaction.editReply({
        content: `ตารางเวลา #${event.id} ถูกยกเลิก.`
      })
    }
  }
}
