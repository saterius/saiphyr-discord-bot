const {
  MessageFlags,
  SlashCommandBuilder
} = require("discord.js")

const partyService = require("../services/partyService")
const scheduleService = require("../services/scheduleService")
const { getScheduleConfig } = require("../services/guildConfigService")
const ServiceError = require("../services/serviceError")
const {
  refreshScheduleVoteMessage
} = require("../services/partyMessageService")
const {
  buildScheduleActionRows,
  buildScheduleEmbed
} = require("../utils/partyUi")

function ensurePartyChannel(interaction, party) {
  if (!party.party_channel_id) {
    throw new ServiceError(
      "This party does not have a party channel yet. Wait until the party is active and the room is created first.",
      "PARTY_CHANNEL_NOT_READY",
      { partyId: party.id }
    )
  }

  if (interaction.channelId !== party.party_channel_id) {
    throw new ServiceError(
      `Use this command in the party channel for this team: <#${party.party_channel_id}>`,
      "INVALID_SCHEDULE_CHANNEL",
      {
        partyId: party.id,
        expectedChannelId: party.party_channel_id,
        actualChannelId: interaction.channelId
      }
    )
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Manage party schedule votes")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a schedule vote for a party")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Schedule title")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("start")
            .setDescription("Start time text, e.g. 2026-04-01 20:00")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("end")
            .setDescription("Optional end time text")
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Optional schedule note")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show a schedule event")
        .addIntegerOption((option) =>
          option
            .setName("event_id")
            .setDescription("Schedule event ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Cancel a schedule event")
        .addIntegerOption((option) =>
          option
            .setName("event_id")
            .setDescription("Schedule event ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for cancellation")
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const title = interaction.options.getString("title")
      const start = interaction.options.getString("start")
      const end = interaction.options.getString("end")
      const description = interaction.options.getString("description")
      const party = await partyService.getPartyById(partyId)
      const scheduleConfig = await getScheduleConfig(interaction.guildId)
      ensurePartyChannel(interaction, party)

      if (!scheduleConfig?.board_channel_id) {
        throw new ServiceError(
          "This guild does not have a schedule board yet. Ask an admin to run /setscheduleboard first.",
          "SCHEDULE_BOARD_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      const resolvedBoardChannelId = scheduleConfig.board_channel_id

      const event = await scheduleService.createScheduleEvent({
        partyId,
        creatorId: interaction.user.id,
        title,
        description,
        proposedStartAt: start,
        proposedEndAt: end,
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
        content: `Schedule vote #${event.id} created. Board: <#${resolvedBoardChannelId}>`
      })

      return
    }

    if (subcommand === "show") {
      const eventId = interaction.options.getInteger("event_id")
      const event = await scheduleService.getScheduleEventById(eventId)
      const party = await partyService.getPartyById(event.party_id)
      ensurePartyChannel(interaction, party)

      await interaction.reply({
        embeds: [buildScheduleEmbed(event, party)],
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "cancel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const eventId = interaction.options.getInteger("event_id")
      const reason = interaction.options.getString("reason") || "Cancelled manually."
      const event = await scheduleService.getScheduleEventById(eventId)
      const party = await partyService.getPartyById(event.party_id)
      ensurePartyChannel(interaction, party)

      await scheduleService.cancelScheduleEvent({
        eventId,
        actorId: interaction.user.id,
        reason
      })

      await refreshScheduleVoteMessage(interaction.client, eventId)

      await interaction.editReply({
        content: `Schedule event #${eventId} cancelled.`
      })
    }
  }
}
