const partyService = require("./partyService")
const scheduleService = require("./scheduleService")
const { provisionPartyResources } = require("./partyProvisioningService")
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
  buildPartyFinishSuggestionRows,
  buildScheduleActionRows,
  buildScheduleBoardOverviewEmbeds,
  buildScheduleCancelledNotice,
  buildScheduleEmbed,
  buildScheduleLockedNotice
} = require("../utils/partyUi")

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

async function refreshPartyRecruitmentMessage(client, partyId) {
  const party = await partyService.getPartyById(partyId)

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

async function sendPartyConfirmationPrompt(client, partyId) {
  const party = await partyService.getPartyById(partyId)

  if (!party.recruit_channel_id) {
    return null
  }

  const channel = await fetchTextChannel(client, party.recruit_channel_id)
  if (!channel || !channel.isTextBased()) {
    return null
  }

  return channel.send({
    content: buildPartyConfirmationNotice(party)
  })
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

  const entries = await scheduleService.listGuildLockedScheduleEntries(guildId)
  const embeds = buildScheduleBoardOverviewEmbeds(entries, guildId)
  const boardState = await getScheduleBoardState(guildId)

  if (!boardState?.board_message_id) {
    const message = await channel.send({
      embeds
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
      embeds
    })

    await setScheduleBoardMessage({
      guildId,
      boardMessageId: replacement.id
    })

    return replacement
  }

  await message.edit({
    embeds
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

async function sendPartyFinishSuggestion(client, partyId, fallbackChannel = null) {
  const party = await partyService.getPartyById(partyId)
  const channel = await fetchTextChannel(client, party.party_channel_id, fallbackChannel)

  if (!channel || !channel.isTextBased()) {
    return null
  }

  return channel.send({
    content: [
      `<@${party.leader_id}> สมาชิกกด ✅ ครบตามจำนวนคนในโพสต์สรุปยอดเงินแล้ว`,
      "ถ้าทุกอย่างเรียบร้อยแล้ว สามารถกดปุ่มด้านล่างเพื่อเสร็จสิ้นปาร์ตี้ได้ทันที หรือใช้ /party finish ในห้องนี้ก็ได้"
    ].join("\n"),
    components: buildPartyFinishSuggestionRows(partyId),
    allowedMentions: {
      users: [party.leader_id]
    }
  }).catch(() => null)
}

module.exports = {
  announceCancelledSchedule,
  postLockedScheduleBoardEntry,
  provisionPartyAndAnnounce,
  refreshPartyRecruitmentMessage,
  refreshScheduleVoteMessage,
  sendPartyFinishSuggestion,
  sendPartyConfirmationPrompt,
  syncGuildScheduleBoard
}
