const fs = require("fs/promises")
const path = require("path")

const DEFAULT_INTERVAL_MS = 60 * 1000
const MONTHLY_MENTION_TIME_ZONE = "Asia/Bangkok"
const MONTHLY_MENTION_START_HOUR = 14
const MONTHLY_MENTION_START_MINUTE = 0
const MONTHLY_MENTION_END_MINUTE = 10
const MONTHLY_MENTION_GUILD_ID = "239981427809189888"
const MONTHLY_MENTION_CHANNEL_ID = "239981427809189888"
const MONTHLY_MENTION_ROLE_ID = "863400503089430528"
const STATE_FILE_PATH = path.join(__dirname, "..", "data", "monthly-role-mention-state.json")

let monthlyMentionInterval = null
let monthlyMentionRunning = false
let lastProcessedMonthKey = null
let stateLoaded = false

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MONTHLY_MENTION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
})

function getBangkokDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    bangkokFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

  return {
    monthKey: `${parts.year}-${parts.month}`,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  }
}

async function loadMonthlyMentionState() {
  if (stateLoaded) {
    return
  }

  stateLoaded = true

  const raw = await fs.readFile(STATE_FILE_PATH, "utf8").catch(() => null)
  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.lastProcessedMonthKey === "string") {
      lastProcessedMonthKey = parsed.lastProcessedMonthKey
    }
  } catch (error) {
    console.error("Failed to parse monthly role mention state.")
    console.error(error)
  }
}

async function saveMonthlyMentionState(monthKey) {
  const state = {
    lastProcessedMonthKey: monthKey,
    updatedAt: new Date().toISOString()
  }

  await fs.writeFile(STATE_FILE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

async function processMonthlyRoleMention(client, date = new Date()) {
  await loadMonthlyMentionState()

  const current = getBangkokDateParts(date)
  const currentMinute = Number(current.minute)

  if (
    current.day !== "01"
    || Number(current.hour) !== MONTHLY_MENTION_START_HOUR
    || currentMinute < MONTHLY_MENTION_START_MINUTE
    || currentMinute > MONTHLY_MENTION_END_MINUTE
  ) {
    return { skipped: true, reason: "not_target_time" }
  }

  if (lastProcessedMonthKey === current.monthKey) {
    return { skipped: true, reason: "already_processed" }
  }

  if (monthlyMentionRunning) {
    return { skipped: true, reason: "already_running" }
  }

  monthlyMentionRunning = true

  try {
    const guild = client.guilds.cache.get(MONTHLY_MENTION_GUILD_ID)
      || await client.guilds.fetch(MONTHLY_MENTION_GUILD_ID).catch(() => null)

    if (!guild) {
      return { skipped: true, reason: "guild_not_found" }
    }

    const channel = await client.channels.fetch(MONTHLY_MENTION_CHANNEL_ID).catch(() => null)
    if (!channel || !channel.isTextBased()) {
      return { skipped: true, reason: "channel_not_text_based" }
    }

    if (channel.guildId !== guild.id) {
      return { skipped: true, reason: "guild_mismatch" }
    }

    await channel.send({
      content: `<@&${MONTHLY_MENTION_ROLE_ID}>`,
      allowedMentions: {
        roles: [MONTHLY_MENTION_ROLE_ID]
      }
    })

    lastProcessedMonthKey = current.monthKey
    await saveMonthlyMentionState(current.monthKey)

    return { skipped: false, monthKey: current.monthKey }
  } finally {
    monthlyMentionRunning = false
  }
}

function startMonthlyRoleMentionLoop(client, intervalMs = DEFAULT_INTERVAL_MS) {
  if (monthlyMentionInterval) {
    return monthlyMentionInterval
  }

  processMonthlyRoleMention(client).catch((error) => {
    console.error("Failed to process monthly role mention.")
    console.error(error)
  })

  monthlyMentionInterval = setInterval(() => {
    processMonthlyRoleMention(client).catch((error) => {
      console.error("Failed to process monthly role mention.")
      console.error(error)
    })
  }, intervalMs)

  if (typeof monthlyMentionInterval.unref === "function") {
    monthlyMentionInterval.unref()
  }

  return monthlyMentionInterval
}

module.exports = {
  getBangkokDateParts,
  processMonthlyRoleMention,
  startMonthlyRoleMentionLoop
}
