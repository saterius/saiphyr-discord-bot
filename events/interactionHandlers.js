const { MessageFlags } = require("discord.js")

const partyService = require("../services/partyService")
const scheduleService = require("../services/scheduleService")
const ServiceError = require("../services/serviceError")
const {
  announceCancelledSchedule,
  postLockedScheduleBoardEntry,
  provisionPartyAndAnnounce,
  refreshPartyRecruitmentMessage,
  refreshScheduleVoteMessage,
  sendPartyConfirmationPrompt
} = require("../services/partyMessageService")
const {
  buildClassSelectRow,
  buildPartyCancelConfirmRows,
  buildJoinConfirmRows,
  getClassOption
} = require("../utils/partyUi")

function createErrorReply(error) {
  if (error instanceof ServiceError) {
    return error.message
  }

  return "Something went wrong while processing that action."
}

async function replyWithError(interaction, error) {
  const content = createErrorReply(error)

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral
    }).catch(() => null)
    return
  }

  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral
  }).catch(() => null)
}

async function handlePartyButton(interaction) {
  const [, action, ...parts] = interaction.customId.split(":")

  if (action === "join" && parts[0] === "start") {
    const partyId = Number(parts[1])
    const party = await partyService.getPartyById(partyId)

    await interaction.reply({
      content: `Choose a class for party #${partyId} (${party.name}).`,
      components: [buildClassSelectRow(partyId)],
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "join" && parts[0] === "confirm") {
    const partyId = Number(parts[1])
    const classKey = parts[2]
    const classOption = getClassOption(classKey)
    const result = await partyService.joinParty({
      partyId,
      userId: interaction.user.id,
      classKey,
      classLabel: classOption?.label || classKey
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    if (result.becameFull) {
      await sendPartyConfirmationPrompt(interaction.client, partyId)
    }

    await interaction.update({
      content: `You joined party #${partyId} as ${classOption?.label || classKey}.`,
      components: []
    })

    return true
  }

  if (action === "confirm") {
    const partyId = Number(parts[0])
    const result = await partyService.respondPartyConfirmation({
      partyId,
      userId: interaction.user.id,
      response: "accepted"
    })

    let activeNotice = ""

    if (result.partyActivated) {
      await provisionPartyAndAnnounce(interaction.client, partyId)
      activeNotice = " Party is now active."
    }

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.reply({
      content: `Confirmation saved for party #${partyId}.${activeNotice}`,
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "refresh") {
    const partyId = Number(parts[0])
    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.reply({
      content: `Party #${partyId} refreshed.`,
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "cancel") {
    const partyId = Number(parts[0])
    const party = await partyService.getPartyById(partyId)

    if (party.leader_id !== interaction.user.id) {
      throw new ServiceError(
        "Only the party leader can cancel this party.",
        "NOT_PARTY_LEADER",
        { partyId, actorId: interaction.user.id }
      )
    }

    await interaction.reply({
      content: `Cancel party #${partyId} (${party.name})? This will close recruitment for everyone.`,
      components: buildPartyCancelConfirmRows(partyId),
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "cancel_confirm") {
    const partyId = Number(parts[0])

    await partyService.updatePartyStatus({
      partyId,
      actorId: interaction.user.id,
      status: "cancelled",
      reason: "Cancelled from recruitment post"
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.update({
      content: `Party #${partyId} has been cancelled.`,
      components: [],
    })

    return true
  }

  if (action === "cancel_abort") {
    const partyId = Number(parts[0])

    await interaction.update({
      content: `Party #${partyId} was not cancelled.`,
      components: []
    })

    return true
  }

  return false
}

async function handlePartyClassSelect(interaction) {
  const [, action, partyIdValue] = interaction.customId.split(":")

  if (action !== "class") {
    return false
  }

  const partyId = Number(partyIdValue)
  const classKey = interaction.values[0]
  const classOption = getClassOption(classKey)

  await interaction.update({
    content: `Selected class: ${classOption?.label || classKey}. Press confirm to join party #${partyId}.`,
    components: buildJoinConfirmRows(partyId, classKey)
  })

  return true
}

async function handleScheduleButton(interaction) {
  const [, action, eventIdValue, vote] = interaction.customId.split(":")

  if (action !== "vote") {
    return false
  }

  const eventId = Number(eventIdValue)
  const result = await scheduleService.voteOnSchedule({
    eventId,
    userId: interaction.user.id,
    vote
  })

  await refreshScheduleVoteMessage(interaction.client, eventId)

  if (result.locked) {
    await postLockedScheduleBoardEntry(interaction.client, eventId)
  } else if (result.cancelled) {
    await announceCancelledSchedule(interaction.client, eventId)
  }

  await interaction.reply({
    content: `Your vote for schedule #${eventId} was recorded as ${vote}.`,
    flags: MessageFlags.Ephemeral
  })

  return true
}

async function handleComponentInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("party:")) {
        return await handlePartyButton(interaction)
      }

      if (interaction.customId.startsWith("schedule:")) {
        return await handleScheduleButton(interaction)
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("party:")) {
      return await handlePartyClassSelect(interaction)
    }

    return false
  } catch (error) {
    console.error(error)
    await replyWithError(interaction, error)
    return true
  }
}

module.exports = {
  handleComponentInteraction
}
