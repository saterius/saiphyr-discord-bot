const scheduleService = require("./scheduleService")
const {
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
