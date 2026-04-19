const {
  AttachmentBuilder
} = require("discord.js")

const partyService = require("./partyService")
const scheduleService = require("./scheduleService")
const { provisionPartyResources } = require("./partyProvisioningService")
const { PARTY_STATUS } = require("./partyConstants")
const ServiceError = require("./serviceError")
const {
  getScheduleBoardState,
  getScheduleConfig,
  setScheduleBoardMessage
} = require("./guildConfigService")
const {
  buildPartyActionRows,
  buildPartyActivationNotice,
  buildPartyConfirmationNotice,
  buildPartyEmbed,
  buildPartyPlannedTimeNotice,
  buildScheduleActionRows,
  buildScheduleBoardOverviewEmbeds,
  buildScheduleCancelledNotice,
  buildScheduleCompletionNotice,
  buildScheduleCompletionPromptRows,
  buildScheduleEmbed,
  buildScheduleLockedNotice
} = require("../utils/partyUi")
const {
  createScheduleBoardImage,
  filterScheduleBoardEntriesForRange,
  getCurrentScheduleBoardRange
} = require("../utils/scheduleBoardImage")

async function fetchTextChannel(client, channelId, fallbackChannel = null) {
  if (!channelId) {
    return null
  }

  if (fallbackChannel?.id === channelId) {
    return fallbackChannel
  }

  if (!client?.channels?.fetch) {
    return null
  }

  return client.channels.fetch(channelId).catch(() => null)
}

async function clearPartyConfirmationPrompt(client, partyId, { party = null } = {}) {
  const currentParty = party || await partyService.getPartyById(partyId)

  if (!currentParty.confirmation_prompt_channel_id || !currentParty.confirmation_prompt_message_id) {
    return currentParty
  }

  const channel = await fetchTextChannel(client, currentParty.confirmation_prompt_channel_id)
  if (channel?.isTextBased()) {
    const promptMessage = await channel.messages
      .fetch(currentParty.confirmation_prompt_message_id)
      .catch(() => null)

    if (promptMessage) {
      await promptMessage.delete().catch(() => null)
    }
  }

  await partyService.clearPartyConfirmationPromptResources(partyId)

  return currentParty
}

async function refreshPartyRecruitmentMessage(client, partyId) {
  const party = await partyService.getPartyById(partyId)

  if (party.status !== PARTY_STATUS.PENDING_CONFIRM) {
    await clearPartyConfirmationPrompt(client, partyId, { party })
  }

  if (!party.recruit_channel_id || !party.recruit_message_id) {
    return party
  }

  const channel = await fetchTextChannel(client, party.recruit_channel_id)
  if (!channel || !channel.isTextBased()) {
    return party
  }

  const message = await channel.messages.fetch(party.recruit_message_id).catch(() => null)
  if (!message) {
    return party
  }

  await message.edit({
    embeds: [buildPartyEmbed(party)],
    components: buildPartyActionRows(party)
  })

  return party
}

async function repostPartyRecruitmentMessage(client, partyId, { sourceMessageId = null } = {}) {
  const party = await partyService.getPartyById(partyId)

  if (![PARTY_STATUS.RECRUITING, PARTY_STATUS.PENDING_CONFIRM].includes(party.status)) {
    throw new ServiceError(
      "รีโพสต์ได้เฉพาะปาร์ตี้ที่ยังเปิดรับคนหรืออยู่ระหว่างรอยืนยันเท่านั้น",
      "PARTY_REPOST_NOT_ALLOWED",
      { partyId, status: party.status }
    )
  }

  if (!party.recruit_channel_id) {
    return party
  }

  const channel = await fetchTextChannel(client, party.recruit_channel_id)
  if (!channel || !channel.isTextBased()) {
    return party
  }

  const oldMessageId = party.recruit_message_id
  const newMessage = await channel.send({
    embeds: [buildPartyEmbed(party)],
    components: buildPartyActionRows(party)
  })

  const updatedParty = await partyService.updatePartyResources({
    partyId,
    recruitChannelId: channel.id,
    recruitMessageId: newMessage.id
  })

  const messageIdsToDelete = new Set([oldMessageId, sourceMessageId].filter(Boolean))
  messageIdsToDelete.delete(newMessage.id)

  for (const messageId of messageIdsToDelete) {
    const oldMessage = await channel.messages.fetch(messageId).catch(() => null)
    if (oldMessage) {
      await oldMessage.delete().catch(() => null)
    }
  }

  await newMessage.edit({
    embeds: [buildPartyEmbed(updatedParty)],
    components: buildPartyActionRows(updatedParty)
  }).catch(() => null)

  return updatedParty
}

async function sendPartyConfirmationPrompt(client, partyId) {
  const party = await partyService.getPartyById(partyId)

  if (party.status !== PARTY_STATUS.PENDING_CONFIRM) {
    return null
  }

  if (!party.recruit_channel_id) {
    return null
  }

  await clearPartyConfirmationPrompt(client, partyId, { party })

  const channel = await fetchTextChannel(client, party.recruit_channel_id)
  if (!channel || !channel.isTextBased()) {
    return null
  }

  const message = await channel.send({
    content: buildPartyConfirmationNotice(party)
  })

  await partyService.setPartyConfirmationPromptResources({
    partyId,
    promptChannelId: message.channelId,
    promptMessageId: message.id
  })

  return message
}

async function provisionPartyAndAnnounce(client, partyId) {
  const party = await partyService.getPartyById(partyId)
  const guild = client.guilds.cache.get(party.guild_id) || await client.guilds.fetch(party.guild_id).catch(() => null)

  if (!guild) {
    return party
  }

  const recruitChannel = await fetchTextChannel(client, party.recruit_channel_id)

  const provisioned = await provisionPartyResources(guild, partyId, {
    parentId: recruitChannel?.parentId || null
  })

  if (recruitChannel?.isTextBased()) {
    await recruitChannel.send({
      content: buildPartyActivationNotice(provisioned.party)
    }).catch(() => null)
  }

  if (provisioned.channel?.isTextBased()) {
    const plannedTimeNotice = buildPartyPlannedTimeNotice(provisioned.party)
    if (plannedTimeNotice) {
      await provisioned.channel.send({
        content: plannedTimeNotice
      }).catch(() => null)
    }
  }

  return provisioned.party
}

async function refreshScheduleVoteMessage(client, eventId) {
  const event = await scheduleService.getScheduleEventById(eventId)
  const party = await partyService.getPartyById(event.party_id)

  if (!event.source_channel_id || !event.vote_message_id) {
    return { event, party }
  }

  const channel = await fetchTextChannel(client, event.source_channel_id)
  if (!channel || !channel.isTextBased()) {
    return { event, party }
  }

  const message = await channel.messages.fetch(event.vote_message_id).catch(() => null)
  if (!message) {
    return { event, party }
  }

  await message.edit({
    embeds: [buildScheduleEmbed(event, party)],
    components: buildScheduleActionRows(event)
  })

  return { event, party }
}

async function postLockedScheduleBoardEntry(client, eventId) {
  const event = await scheduleService.getScheduleEventById(eventId)
  return syncGuildScheduleBoard(client, event.guild_id, event.board_channel_id)
}

async function syncGuildScheduleBoard(client, guildId, explicitBoardChannelId = null) {
  const scheduleConfig = explicitBoardChannelId
    ? { board_channel_id: explicitBoardChannelId }
    : await getScheduleConfig(guildId)

  if (!scheduleConfig?.board_channel_id) {
    return null
  }

  const channel = await fetchTextChannel(client, scheduleConfig.board_channel_id)
  if (!channel || !channel.isTextBased()) {
    return null
  }

  const entries = await scheduleService.listGuildScheduleBoardEntries(guildId)
  const imageEntries = await scheduleService.listGuildScheduleBoardImageEntries(guildId)
  const boardRange = getCurrentScheduleBoardRange()
  const unscheduledParties = await scheduleService.listGuildUnscheduledScheduleBoardParties(guildId, boardRange)
  const visibleEntries = filterScheduleBoardEntriesForRange(entries, boardRange)
  const visibleImageEntries = filterScheduleBoardEntriesForRange(imageEntries, boardRange)
  const embeds = buildScheduleBoardOverviewEmbeds(visibleEntries, guildId, { boardRange })
  const boardImage = await createScheduleBoardImage(visibleImageEntries, {
    range: boardRange,
    unscheduledParties
  })
  const files = boardImage
    ? [new AttachmentBuilder(boardImage.buffer, { name: boardImage.name })]
    : []

  if (boardImage && embeds.length) {
    embeds[0].setImage(`attachment://${boardImage.name}`)
  }

  const boardState = await getScheduleBoardState(guildId)

  if (!boardState?.board_message_id) {
    const message = await channel.send({
      embeds,
      files
    })

    await setScheduleBoardMessage({
      guildId,
      boardMessageId: message.id
    })

    return message
  }

  const message = await channel.messages.fetch(boardState.board_message_id).catch(() => null)

  if (!message) {
    const replacement = await channel.send({
      embeds,
      files
    })

    await setScheduleBoardMessage({
      guildId,
      boardMessageId: replacement.id
    })

    return replacement
  }

  await message.edit({
    embeds,
    files,
    attachments: []
  })

  return message
}

async function announceCancelledSchedule(client, eventId) {
  const event = await scheduleService.getScheduleEventById(eventId)
  const sourceChannel = await fetchTextChannel(client, event.source_channel_id)

  if (sourceChannel?.isTextBased()) {
    await sourceChannel.send({
      content: buildScheduleCancelledNotice(event)
    }).catch(() => null)
  }

  await syncGuildScheduleBoard(client, event.guild_id)

  return event
}

async function sendScheduleCompletionSuggestion(client, event, fallbackChannel = null) {
  const channel = await fetchTextChannel(
    client,
    event.party_channel_id || event.source_channel_id,
    fallbackChannel
  )

  if (!channel || !channel.isTextBased()) {
    return null
  }

  return channel.send({
    content: buildScheduleCompletionNotice(event),
    components: buildScheduleCompletionPromptRows(event.id),
    allowedMentions: {
      users: [event.leader_id]
    }
  }).catch(() => null)
}

module.exports = {
  announceCancelledSchedule,
  postLockedScheduleBoardEntry,
  provisionPartyAndAnnounce,
  clearPartyConfirmationPrompt,
  refreshPartyRecruitmentMessage,
  repostPartyRecruitmentMessage,
  refreshScheduleVoteMessage,
  sendScheduleCompletionSuggestion,
  sendPartyConfirmationPrompt,
  syncGuildScheduleBoard
}
