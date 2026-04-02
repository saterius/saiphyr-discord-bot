const scheduleService = require("./scheduleService")
const {
  announceCancelledSchedule,
  refreshScheduleVoteMessage,
  sendScheduleCompletionSuggestion,
  syncGuildScheduleBoard
} = require("./partyMessageService")

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
let reminderInterval = null
let reminderRunning = false

async function processScheduleCompletionPrompts(client) {
  if (reminderRunning) {
    return
  }

  reminderRunning = true

  try {
    const overdueVotingEvents = await scheduleService.listVotingScheduleEventsPastDue()

    for (const event of overdueVotingEvents) {
      await scheduleService.autoCancelScheduleEvent({
        eventId: event.id,
        reason: "ยกเลิกอัตโนมัติ เพราะสมาชิกยอมรับไม่ครบก่อนถึงเวลานัด"
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
    console.error("Failed to process schedule completion prompts.")
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
  startScheduleReminderLoop
}
