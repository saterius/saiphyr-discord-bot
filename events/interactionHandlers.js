const { MessageFlags } = require("discord.js")

const partyService = require("../services/partyService")
const scheduleService = require("../services/scheduleService")
const { finishParty } = require("../services/partyLifecycleService")
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
  buildPartyFinishSuggestionRows,
  buildJoinConfirmRows,
  getClassOption
} = require("../utils/partyUi")

const activeButtonLocks = new Set()

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

function createButtonLockError(interaction) {
  return new ServiceError(
    "ปุ่มนี้กำลังอยู่ระหว่างการประมวลผล กรุณารอสักครู่",
    "BUTTON_ACTION_IN_PROGRESS",
    { customId: interaction.customId, userId: interaction.user?.id || null }
  )
}

function getButtonLockKey(interaction) {
  if (!interaction?.customId || !interaction?.user?.id) {
    return null
  }

  const [scope, action, ...parts] = interaction.customId.split(":")

  if (scope === "party") {
    if (action === "join" && parts[0] === "start") {
      return `party:join:start:${parts[1]}:${interaction.user.id}`
    }

    if (action === "join" && parts[0] === "confirm") {
      return `party:join:confirm:${parts[1]}:${interaction.user.id}`
    }

    if (action === "confirm") {
      return `party:confirm:${parts[0]}:${interaction.user.id}`
    }

    if (action === "refresh") {
      return `party:refresh:${parts[0]}:${interaction.user.id}`
    }

    if (action === "close_recruitment") {
      return `party:close_recruitment:${parts[0]}`
    }

    if (action === "cancel") {
      return `party:cancel:${parts[0]}:${interaction.user.id}`
    }

    if (action === "cancel_confirm") {
      return `party:cancel_confirm:${parts[0]}`
    }

    if (action === "cancel_abort") {
      return `party:cancel_abort:${parts[0]}`
    }

    if (action === "finish_now") {
      return `party:finish_now:${parts[0]}`
    }

    if (action === "finish_abort") {
      return `party:finish_abort:${parts[0]}`
    }
  }

  if (scope === "schedule" && action === "vote") {
    return `schedule:vote:${parts[0]}:${interaction.user.id}`
  }

  return null
}

async function withButtonLock(interaction, handler) {
  const lockKey = getButtonLockKey(interaction)

  if (!lockKey) {
    return handler()
  }

  if (activeButtonLocks.has(lockKey)) {
    throw createButtonLockError(interaction)
  }

  activeButtonLocks.add(lockKey)

  try {
    return await handler()
  } finally {
    activeButtonLocks.delete(lockKey)
  }
}

async function handlePartyButton(interaction) {
  const [, action, ...parts] = interaction.customId.split(":")

  if (action === "join" && parts[0] === "start") {
    const partyId = Number(parts[1])

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    })

    const party = await partyService.getPartyById(partyId)

    await interaction.editReply({
      content: `เลือกอาชีพสำหรับปาร์ตี้ #${partyId} (${party.name}).`,
      components: [buildClassSelectRow(partyId)]
    })

    return true
  }

  if (action === "join" && parts[0] === "confirm") {
    const partyId = Number(parts[1])
    const classKey = parts[2]
    const classOption = getClassOption(classKey)

    await interaction.deferUpdate()

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

    await interaction.editReply({
      content: `คุณได้เข้าร่วมปาร์ตี้ #${partyId} ด้วยอาชีพ ${classOption?.label || classKey}.`,
      components: []
    })

    return true
  }

  if (action === "confirm") {
    const partyId = Number(parts[0])

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    })

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

    await interaction.editReply({
      content: `การยืนยันสำหรับปาร์ตี้ #${partyId}${activeNotice} ถูกบันทึกแล้ว`
    })

    return true
  }

  if (action === "refresh") {
    const partyId = Number(parts[0])

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.editReply({
      content: `ปาร์ตี้ #${partyId} ถูกรีเฟรช.`
    })

    return true
  }

  if (action === "close_recruitment") {
    const partyId = Number(parts[0])

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    })

    const result = await partyService.closePartyRecruitment({
      partyId,
      actorId: interaction.user.id
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)
    await sendPartyConfirmationPrompt(interaction.client, partyId)

    await interaction.editReply({
      content: `ปาร์ตี้ #${partyId} ปิดรับสมัครแล้ว และส่งคำขอยืนยันให้สมาชิกทั้ง ${result.party.active_member_count} คนเรียบร้อย`
    })

    return true
  }

  if (action === "cancel") {
    const partyId = Number(parts[0])

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    })

    const party = await partyService.getPartyById(partyId)

    if (party.leader_id !== interaction.user.id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่ยกเลิกปาร์ตี้ได้.",
        "NOT_PARTY_LEADER",
        { partyId, actorId: interaction.user.id }
      )
    }

    await interaction.editReply({
      content: `ยกเลิกปาร์ตี้ #${partyId} (${party.name})? การกระทำนี้จะปิดรับการสมัครสมาชิก.`,
      components: buildPartyCancelConfirmRows(partyId)
    })

    return true
  }

  if (action === "cancel_confirm") {
    const partyId = Number(parts[0])

    await interaction.deferUpdate()

    await partyService.updatePartyStatus({
      partyId,
      actorId: interaction.user.id,
      status: "cancelled",
      reason: "ถูกยกเลิกจากโพสต์รับสมาชิก"
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    await interaction.editReply({
      content: `ปาร์ตี้ #${partyId} ถูกยกเลิกแล้ว.`,
      components: []
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

  if (action === "finish_now") {
    const partyId = Number(parts[0])

    await interaction.deferUpdate()

    const party = await partyService.getPartyById(partyId)

    if (party.leader_id !== interaction.user.id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่จบปาร์ตี้ได้.",
        "NOT_PARTY_LEADER",
        { partyId, actorId: interaction.user.id }
      )
    }

    await interaction.editReply({
      content: `กำลังเสร็จสิ้นปาร์ตี้ #${partyId} กรุณารอสักครู่...`,
      components: buildPartyFinishSuggestionRows(partyId, { disabled: true })
    })

    const guild = interaction.client.guilds.cache.get(party.guild_id)
      || await interaction.client.guilds.fetch(party.guild_id).catch(() => null)

    if (!guild) {
      throw new ServiceError(
        "ไม่พบกิลด์ของปาร์ตี้นี้ในตอนนี้",
        "GUILD_NOT_FOUND",
        { partyId, guildId: party.guild_id }
      )
    }

    const result = await finishParty({
      guild,
      partyId,
      actorId: interaction.user.id,
      reason: "จบปาร์ตี้จากข้อความแนะนำหลังสมาชิกกดยืนยันยอดครบ"
    })

    await refreshPartyRecruitmentMessage(interaction.client, partyId)

    const deletedBits = []
    if (result.removedRole) {
      deletedBits.push("ลบยศแล้ว")
    }
    if (result.removedChannel) {
      deletedBits.push("ลบห้องแล้ว")
    }

    await interaction.editReply({
      content: `ปาร์ตี้ #${partyId} จบแล้ว${deletedBits.length ? ` (${deletedBits.join(", ")})` : ""}`,
      components: []
    })

    return true
  }

  if (action === "finish_abort") {
    const partyId = Number(parts[0])
    const party = await partyService.getPartyById(partyId)

    if (party.leader_id !== interaction.user.id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่จัดการข้อความนี้ได้.",
        "NOT_PARTY_LEADER",
        { partyId, actorId: interaction.user.id }
      )
    }

    await interaction.update({
      content: `เก็บปาร์ตี้ #${partyId} ไว้ก่อน ตอนพร้อมค่อยใช้ /party finish ได้เสมอ`,
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

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  })

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

  await interaction.editReply({
    content: `การโหวตตารางนัดเวลา #${eventId} ถูกบันทึกว่า ${vote}.`
  })

  return true
}

async function handleComponentInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      return await withButtonLock(interaction, async () => {
        if (interaction.customId.startsWith("party:")) {
          return await handlePartyButton(interaction)
        }

        if (interaction.customId.startsWith("schedule:")) {
          return await handleScheduleButton(interaction)
        }

        return false
      })
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
