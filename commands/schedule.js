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
const { memberHasPartyAdminRole } = require("../utils/partyAdminAuth")

async function fetchTextChannel(client, channelId) {
  if (!channelId || !client?.channels?.fetch) {
    return null
  }

  return client.channels.fetch(channelId).catch(() => null)
}

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
        .setDescription("แสดงตารางเวลาแบบโพสต์ซ้ำ")
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const party = await resolvePartyFromChannel(interaction)
      const event = await scheduleService.getLatestScheduleEventForParty(party.id)

      if (!event) {
        throw new ServiceError(
          "ปาร์ตี้นี้ยังไม่มีการนัดตารางเวลา",
          "SCHEDULE_NOT_FOUND",
          { partyId: party.id }
        )
      }

      const repostChannel = interaction.channel
      if (!repostChannel?.isTextBased()) {
        throw new ServiceError(
          "ช่องนี้ไม่สามารถส่งโพสต์ตารางเวลาได้",
          "INVALID_CHANNEL",
          { channelId: interaction.channelId }
        )
      }

      const oldChannelId = event.source_channel_id
      const oldMessageId = event.vote_message_id

      const voteMessage = await repostChannel.send({
        content: party.party_role_id ? `<@&${party.party_role_id}>` : `Party ${party.name}`,
        embeds: [buildScheduleEmbed(event, party)],
        components: buildScheduleActionRows(event)
      })

      if (oldChannelId && oldMessageId) {
        const oldChannel = await fetchTextChannel(interaction.client, oldChannelId)
        if (oldChannel?.isTextBased()) {
          const oldMessage = await oldChannel.messages.fetch(oldMessageId).catch(() => null)
          if (oldMessage) {
            await oldMessage.delete().catch(() => null)
          }
        }
      }

      await scheduleService.updateScheduleMessages({
        eventId: event.id,
        sourceChannelId: repostChannel.id,
        voteMessageId: voteMessage.id
      })

      await interaction.editReply({
        content: `รีโพสต์ตารางเวลา #${event.id} ไปที่ <#${repostChannel.id}> แล้ว`
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
        reason,
        allowNonManager: await memberHasPartyAdminRole(interaction)
      })

      await refreshScheduleVoteMessage(interaction.client, event.id)
      await syncGuildScheduleBoard(interaction.client, interaction.guildId)

      await interaction.editReply({
        content: `ตารางเวลา #${event.id} ถูกยกเลิกแล้ว`
      })

      return
    }
  }
}
