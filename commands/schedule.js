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
const { parseBangkokDateTimeRange } = require("../utils/dateTimeRange")

function ensurePartyChannel(interaction, party) {
  if (!party) {
    throw new ServiceError(
      "ใช้คำสั่ง /schedule ได้แค่ในช่องของปาร์ตี้เท่านั้น",
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("จัดการโหวตตารางเวลาของปาร์ตี้")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("สร้างโหวตตารางเวลาสำหรับปาร์ตี้")
        .addStringOption((option) =>
          option
            .setName("datetime_range")
            .setDescription("รูปแบบ DD-MM-YYYY hh:mm-hh:mm เช่น 25-04-2026 21:30-22:30")
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lock")
        .setDescription("ล็อกตารางนัดเวลาแม้ยังยอมรับไม่ครบทุกคน")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่ต้องล็อกตารางทันที")
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const dateTimeRangeInput = interaction.options.getString("datetime_range")
      const description = interaction.options.getString("description")
      const party = await resolvePartyFromChannel(interaction)
      const scheduleConfig = await getScheduleConfig(interaction.guildId)

      if (!scheduleConfig?.board_channel_id) {
        throw new ServiceError(
          "ยังไม่ได้เลือกแชนแนลสำหรับช่องตารางเวลา โปรดแจ้งผู้ดูแลให้ตั้งค่า /setscheduleboard ก่อน",
          "SCHEDULE_BOARD_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      const resolvedBoardChannelId = scheduleConfig.board_channel_id
      const parsedRange = parseBangkokDateTimeRange(dateTimeRangeInput, {
        required: true,
        errorCode: "INVALID_SCHEDULE_DATETIME",
        label: "ช่วงเวลานัด "
      })

      const event = await scheduleService.createScheduleEvent({
        partyId: party.id,
        creatorId: interaction.user.id,
        title: party.name,
        description,
        proposedStartAt: parsedRange.proposedStartAt,
        proposedEndAt: parsedRange.proposedEndAt,
        startAtUnix: parsedRange.startAtUnix,
        endAtUnix: parsedRange.endAtUnix,
        timezone: parsedRange.timezone,
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

      await syncGuildScheduleBoard(interaction.client, interaction.guildId, resolvedBoardChannelId)

      await interaction.editReply({
        content: `ตารางเวลา #${event.id} ถูกสร้างแล้ว บอร์ด: <#${resolvedBoardChannelId}>`
      })

      return
    }

    if (subcommand === "show") {
      const party = await resolvePartyFromChannel(interaction)
      const event = await scheduleService.getLatestScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ยังไม่มีการนัดตารางเวลา",
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
      const event = await scheduleService.getCancelableScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ไม่มีการนัดตารางเวลาที่ต้องการยกเลิก",
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
        content: `ตารางเวลา #${event.id} ถูกยกเลิกแล้ว`
      })

      return
    }

    if (subcommand === "lock") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const reason = interaction.options.getString("reason") || "Locked manually."
      const party = await resolvePartyFromChannel(interaction)
      const event = await scheduleService.getVotingScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ไม่มีตารางที่กำลังโหวตและพร้อมให้ล็อก",
          "SCHEDULE_NOT_FOUND",
          { partyId: party.id }
        )
      }

      if (event.leader_id !== interaction.user.id && event.creator_id !== interaction.user.id) {
        throw new ServiceError(
          "หัวหน้าปาร์ตี้หรือคนที่สร้างตารางนัดนี้เท่านั้นที่ล็อกตารางได้",
          "NOT_SCHEDULE_MANAGER",
          { eventId: event.id, actorId: interaction.user.id }
        )
      }

      await scheduleService.lockScheduleEvent({
        eventId: event.id,
        actorId: interaction.user.id,
        reason
      })

      await refreshScheduleVoteMessage(interaction.client, event.id)
      await syncGuildScheduleBoard(interaction.client, interaction.guildId)

      await interaction.editReply({
        content: `ล็อกตารางนัดเวลา #${event.id} เรียบร้อยแล้ว`
      })
    }
  }
}
