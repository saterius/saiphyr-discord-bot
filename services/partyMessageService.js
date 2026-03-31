const partyService = require("./partyService")
const scheduleService = require("./scheduleService")
const { provisionPartyResources } = require("./partyProvisioningService")
const {
  buildPartyActionRows,
  buildPartyActivationNotice,
  buildPartyConfirmationNotice,
  buildPartyEmbed,
  buildScheduleActionRows,
  buildScheduleBoardEmbed,
  buildScheduleCancelledNotice,
  buildScheduleEmbed,
  buildScheduleLockedNotice
} = require("../utils/partyUi")

async function fetchTextChannel(client, channelId) {
  if (!channelId) {
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
  const party = await partyService.getPartyById(event.party_id)

  if (!event.board_channel_id) {
    return event
  }

  const channel = await fetchTextChannel(client, event.board_channel_id)
  if (!channel || !channel.isTextBased()) {
    return event
  }

  if (!event.board_message_id) {
    const message = await channel.send({
      content: party.party_role_id ? `<@&${party.party_role_id}>` : `Party ${party.name}`,
      embeds: [buildScheduleBoardEmbed(event, party)]
    })

    await scheduleService.updateScheduleMessages({
      eventId,
      boardChannelId: channel.id,
      boardMessageId: message.id
    })
  } else {
    const message = await channel.messages.fetch(event.board_message_id).catch(() => null)
    if (message) {
      await message.edit({
        content: party.party_role_id ? `<@&${party.party_role_id}>` : `Party ${party.name}`,
        embeds: [buildScheduleBoardEmbed(event, party)]
      })
    }
  }

  const sourceChannel = await fetchTextChannel(client, event.source_channel_id)
  if (sourceChannel?.isTextBased()) {
    await sourceChannel.send({
      content: buildScheduleLockedNotice(event)
    }).catch(() => null)
  }

  return scheduleService.getScheduleEventById(eventId)
}

async function announceCancelledSchedule(client, eventId) {
  const event = await scheduleService.getScheduleEventById(eventId)
  const sourceChannel = await fetchTextChannel(client, event.source_channel_id)

  if (sourceChannel?.isTextBased()) {
    await sourceChannel.send({
      content: buildScheduleCancelledNotice(event)
    }).catch(() => null)
  }

  return event
}

module.exports = {
  announceCancelledSchedule,
  postLockedScheduleBoardEntry,
  provisionPartyAndAnnounce,
  refreshPartyRecruitmentMessage,
  refreshScheduleVoteMessage,
  sendPartyConfirmationPrompt
}
