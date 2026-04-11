const partyService = require("./partyService")
const scheduleService = require("./scheduleService")
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

let reminderInterval = null
let reminderRunning = false

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

async function processScheduleCompletionPrompts(client) {
  if (reminderRunning) {
    return
  }

  reminderRunning = true

  try {
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
  processScheduleCompletionPrompts,
  processOverdueAdHocPartyCancellations,
  startScheduleReminderLoop
}
