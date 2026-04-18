const partyService = require("./partyService")
const scheduleService = require("./scheduleService")
const { clearPartyChannelClearedMark } = require("./partyProvisioningService")
const {
  announceCancelledSchedule,
  refreshPartyRecruitmentMessage,
  refreshScheduleVoteMessage,
  sendScheduleCompletionSuggestion,
  syncGuildScheduleBoard
} = require("./partyMessageService")

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const OVERDUE_AD_HOC_CANCEL_REASON = "ยกเลิกอัตโนมัติ เพราะเลยเวลานัดมาแล้วมากกว่า 1 ชั่วโมงและปาร์ตี้ยังไม่พร้อมลุย"
const OVERDUE_SCHEDULE_CANCEL_REASON = "ยกเลิกอัตโนมัติ เพราะสมาชิกโหวตไม่ครบก่อนถึงเวลานัด"

const REMINDER_TIME_ZONE = "Asia/Bangkok"

let reminderInterval = null
let reminderRunning = false
let lastClearedResetDateKey = null

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REMINDER_TIME_ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
})

function getBangkokDateTimeParts(date = new Date()) {
  const parts = Object.fromEntries(
    bangkokFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

  return {
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour,
    minute: parts.minute
  }
}

function shouldProcessWeeklyClearedChannelReset(current) {
  return current.weekday === "Sat"
    && current.hour === "08"
    && Number(current.minute) <= 50
}

async function processOverdueAdHocPartyCancellations(client) {
  const overdueParties = await partyService.listOverdueAdHocPartiesForAutoCancellation()

  for (const party of overdueParties) {
    await partyService.updatePartyStatus({
      partyId: party.id,
      actorId: party.leader_id,
      status: "cancelled",
      reason: OVERDUE_AD_HOC_CANCEL_REASON,
      allowNonLeader: true
    })

    await refreshPartyRecruitmentMessage(client, party.id).catch(() => null)
  }
}

async function processWeeklyClearedChannelReset(client, date = new Date()) {
  const current = getBangkokDateTimeParts(date)

  if (!shouldProcessWeeklyClearedChannelReset(current)) {
    return { skipped: true, reason: "not_reset_time" }
  }

  if (lastClearedResetDateKey === current.dateKey) {
    return { skipped: true, reason: "already_processed" }
  }

  let resetCount = 0

  for (const guild of client.guilds.cache.values()) {
    const parties = await partyService.listGuildParties(guild.id)

    for (const party of parties) {
      if (!party.party_channel_id) {
        continue
      }

      const channel = await clearPartyChannelClearedMark(guild, party.id).catch(() => null)
      if (channel) {
        resetCount += 1
      }
    }
  }

  lastClearedResetDateKey = current.dateKey
  return { skipped: false, resetCount }
}

async function processScheduleCompletionPrompts(client) {
  if (reminderRunning) {
    return
  }

  reminderRunning = true

  try {
    await processWeeklyClearedChannelReset(client)
    await processOverdueAdHocPartyCancellations(client)

    const overdueVotingEvents = await scheduleService.listVotingScheduleEventsPastDue()

    for (const event of overdueVotingEvents) {
      await scheduleService.autoCancelScheduleEvent({
        eventId: event.id,
        reason: OVERDUE_SCHEDULE_CANCEL_REASON
      })

      await refreshScheduleVoteMessage(client, event.id).catch(() => null)
      await announceCancelledSchedule(client, event.id).catch(() => null)
    }

    const dueLockedEvents = await scheduleService.listLockedScheduleEventsPastStart()

    for (const event of dueLockedEvents) {
      await refreshScheduleVoteMessage(client, event.id).catch(() => null)
    }

    const events = await scheduleService.listScheduleEventsNeedingCompletionPrompt()

    for (const event of events) {
      const message = await sendScheduleCompletionSuggestion(client, event)

      if (!message) {
        continue
      }

      await scheduleService.markScheduleCompletionPromptSent({
        eventId: event.id,
        promptChannelId: message.channelId,
        promptMessageId: message.id
      })

      await syncGuildScheduleBoard(client, event.guild_id).catch(() => null)
    }
  } catch (error) {
    console.error("Failed to process schedule reminder tasks.")
    console.error(error)
  } finally {
    reminderRunning = false
  }
}

function startScheduleReminderLoop(client, intervalMs = DEFAULT_INTERVAL_MS) {
  if (reminderInterval) {
    return reminderInterval
  }

  processScheduleCompletionPrompts(client).catch(() => null)

  reminderInterval = setInterval(() => {
    processScheduleCompletionPrompts(client).catch(() => null)
  }, intervalMs)

  if (typeof reminderInterval.unref === "function") {
    reminderInterval.unref()
  }

  return reminderInterval
}

module.exports = {
  getBangkokDateTimeParts,
  shouldProcessWeeklyClearedChannelReset,
  processScheduleCompletionPrompts,
  processOverdueAdHocPartyCancellations,
  processWeeklyClearedChannelReset,
  startScheduleReminderLoop
}
