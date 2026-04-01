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

  return "มีบางอย่างผิดพลาดสำหรับการกระทำนี้."
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
      content: `เลือกอาชีพสำหรับปาร์ตี้ #${partyId} (${party.name}).`,
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
      content: `คุณได้เข้าร่วมปาร์ตี้ #${partyId} ด้วอาชีพ ${classOption?.label || classKey}.`,
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
      activeNotice = " ปาร์ตี้พร้อมแล้ว."
    }

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.reply({
      content: `การยืนยันสำหรับปาร์ตี้ #${partyId}.${activeNotice} ถูกบันทึกแล้ว`,
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "refresh") {
    const partyId = Number(parts[0])
    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.reply({
      content: `ปาร์ตี้ #${partyId} ถูกรีเฟรช.`,
      flags: MessageFlags.Ephemeral
    })

    return true
  }

  if (action === "cancel") {
    const partyId = Number(parts[0])
    const party = await partyService.getPartyById(partyId)

    if (party.leader_id !== interaction.user.id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่ยกเลิกปาร์ตี้ได้.",
        "NOT_PARTY_LEADER",
        { partyId, actorId: interaction.user.id }
      )
    }

    await interaction.reply({
      content: `ยกเลิกปาร์ตี้ #${partyId} (${party.name})? การกระทำนี้จะปิดรับการสมัครสมาชิก.`,
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
      reason: "ถูกยกเลิกจากโพสต์รับสมาชิก"
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.update({
      content: `ปาร์ตี้ #${partyId} ถูกยกเลิกแล้ว.`,
      components: [],
    })

    return true
  }

  if (action === "cancel_abort") {
    const partyId = Number(parts[0])

    await interaction.update({
      content: `ปาร์ตี้ #${partyId} ยังไม่ได้ถูกยกเลิก.`,
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
    content: `อาชีพที่เลือก: ${classOption?.label || classKey}. กรุณากดปุ่ม "ยืนยันที่จะเข้าร่วม" เพื่อเข้าร่วมปาร์ตี้ #${partyId}.`,
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
