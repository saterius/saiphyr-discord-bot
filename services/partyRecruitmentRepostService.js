const partyService = require("./partyService")
const { repostPartyRecruitmentMessage } = require("./partyMessageService")

const DEFAULT_INTERVAL_MS = 60 * 1000
const REPOST_TIME_ZONE = "Asia/Bangkok"

let repostInterval = null
let repostRunning = false
let lastRepostDateKey = null

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPOST_TIME_ZONE,
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
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour,
    minute: parts.minute
  }
}

async function processDailyPartyRecruitmentReposts(client, date = new Date()) {
  const current = getBangkokDateTimeParts(date)

  if (current.hour !== "00" || current.minute !== "00") {
    return { skipped: true, reason: "not_midnight" }
  }

  if (lastRepostDateKey === current.dateKey) {
    return { skipped: true, reason: "already_processed" }
  }

  if (repostRunning) {
    return { skipped: true, reason: "already_running" }
  }

  repostRunning = true
  lastRepostDateKey = current.dateKey

  try {
    const parties = await partyService.listRecruitingParties()
    let repostedCount = 0

    for (const party of parties) {
      try {
        await repostPartyRecruitmentMessage(client, party.id)
        repostedCount += 1
      } catch (error) {
        console.error(`Failed to repost recruitment message for party #${party.id}.`)
        console.error(error)
      }
    }

    return { skipped: false, repostedCount }
  } finally {
    repostRunning = false
  }
}

function startDailyPartyRecruitmentRepostLoop(client, intervalMs = DEFAULT_INTERVAL_MS) {
  if (repostInterval) {
    return repostInterval
  }

  processDailyPartyRecruitmentReposts(client).catch((error) => {
    console.error("Failed to process daily party recruitment reposts.")
    console.error(error)
  })

  repostInterval = setInterval(() => {
    processDailyPartyRecruitmentReposts(client).catch((error) => {
      console.error("Failed to process daily party recruitment reposts.")
      console.error(error)
    })
  }, intervalMs)

  if (typeof repostInterval.unref === "function") {
    repostInterval.unref()
  }

  return repostInterval
}

module.exports = {
  getBangkokDateTimeParts,
  processDailyPartyRecruitmentReposts,
  startDailyPartyRecruitmentRepostLoop
}
