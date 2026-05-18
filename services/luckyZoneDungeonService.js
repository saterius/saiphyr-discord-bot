const fs = require("fs/promises")
const path = require("path")

const DEFAULT_INTERVAL_MS = 60 * 1000
const LUCKY_ZONE_TIME_ZONE = "Asia/Bangkok"
const LUCKY_ZONE_START_HOUR = Number(process.env.LUCKY_ZONE_START_HOUR || 8)
const LUCKY_ZONE_START_MINUTE = Number(process.env.LUCKY_ZONE_START_MINUTE || 0)
const LUCKY_ZONE_END_MINUTE = Number(process.env.LUCKY_ZONE_END_MINUTE || 10)
const LUCKY_ZONE_CHANNEL_ID = process.env.LUCKY_ZONE_CHANNEL_ID || "1231574812485353522"
const STATE_FILE_PATH = path.join(__dirname, "..", "data", "lucky-zone-dungeon-state.json")
const LUCKY_ZONE_GUILD_IDS_INDEX = 2

// Patch 60 currently has one Lucky Zone dungeon. May 2026 is pattern 2.
const ANCHOR_YEAR = 2026
const ANCHOR_MONTH = 5
const ANCHOR_PATTERN_INDEX = 1

const LUCKY_ZONE_PATTERNS = [
  [
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Boundaries",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Core",
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Encroached Temple Ruins",
    "Meteor Crash Site Boundaries",
    "Shadow of Evil Spirits",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Boundaries",
    "Mutant's Habitat"
  ],
  [
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Mutant's Habitat",
    "Encroached Temple Ruins",
    "Meteor Crash Site Boundaries",
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Meteor Crash Site Boundaries",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Core",
    "Encroached Temple Ruins",
    "Meteor Crash Site Boundaries",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Boundaries",
    "Meteor Crash Site Core",
    "Encroached Temple Ruins",
    "Shadow of Evil Spirits",
    "Mutant's Habitat",
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Shadow of Evil Spirits"
  ],
  [
    "Meteor Crash Site Core",
    "Meteor Crash Site Boundaries",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Core",
    "Mutant's Habitat",
    "Encroached Temple Ruins",
    "Meteor Crash Site Boundaries",
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Mutant's Habitat",
    "Meteor Crash Site Core",
    "Meteor Crash Site Boundaries",
    "Shadow of Evil Spirits",
    "Encroached Temple Ruins",
    "Mutant's Habitat",
    "Meteor Crash Site Boundaries",
    "Meteor Crash Site Core",
    "Encroached Temple Ruins",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Boundaries",
    "Mutant's Habitat",
    "Meteor Crash Site Core",
    "Shadow of Evil Spirits",
    "Encroached Temple Ruins",
    "Meteor Crash Site Boundaries",
    "Mutant's Habitat",
    "Shadow of Evil Spirits",
    "Meteor Crash Site Core",
    "Encroached Temple Ruins"
  ]
]

let luckyZoneInterval = null
let luckyZoneRunning = false
let lastProcessedDateKey = null
let stateLoaded = false

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LUCKY_ZONE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
})

function getGuildIdsFromEnv() {
  return String(process.env.GUILD_IDS || "")
    .split(",")
    .map((guildId) => guildId.trim())
    .filter(Boolean)
}

function getLuckyZoneGuildId() {
  return process.env.LUCKY_ZONE_GUILD_ID || getGuildIdsFromEnv()[LUCKY_ZONE_GUILD_IDS_INDEX] || null
}

function getBangkokDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    bangkokFormatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    unix: Math.floor(date.getTime() / 1000),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  }
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor
}

function getPatternIndex(year, month) {
  const monthOffset = (year - ANCHOR_YEAR) * 12 + (month - ANCHOR_MONTH)
  return mod(ANCHOR_PATTERN_INDEX + monthOffset, LUCKY_ZONE_PATTERNS.length)
}

function getLuckyZoneDungeonForDate(date = new Date()) {
  const parts = getBangkokDateParts(date)
  const patternIndex = getPatternIndex(parts.year, parts.month)
  const dungeon = LUCKY_ZONE_PATTERNS[patternIndex][parts.day - 1]

  return {
    ...parts,
    pattern: patternIndex + 1,
    // luckyZone1: maps[0],
    // luckyZone2: maps[1]
    luckyZone: dungeon
  }
}

function formatDiscordDate(entry) {
  return `<t:${entry.unix}:D>`
}

const LUCKY_ZONE_DUNGEON_DESCRIPTIONS = {
  "Encroached Temple Ruins": "หมึกกะพรุน",
  "Mutant's Habitat": "ด้วง",
  "Meteor Crash Site Boundaries": "ผีเสื้อ",
  "Shadow of Evil Spirits": "เอเลี่ยน",
  "Meteor Crash Site Core": "ดาร์คไนท์"
}

function formatLuckyZoneDungeonName(dungeon) {
  const description = LUCKY_ZONE_DUNGEON_DESCRIPTIONS[dungeon]
  if (description) {
    if (dungeon === "Meteor Crash Site Core") {
      return `${dungeon} (${description}) (ดันแย่)`
    }
    return `${dungeon} (${description})`
  }

  return dungeon
}

function buildLuckyZoneDungeonMessage(date = new Date()) {
  const today = getLuckyZoneDungeonForDate(date)
  const tomorrow = getLuckyZoneDungeonForDate(new Date(date.getTime() + 24 * 60 * 60 * 1000))

  // return [
  //   "**Lucky Zone Dungeon วันนี้ / พรุ่งนี้**",
  //   `วันนี้ (${formatDiscordDate(today)}) - Pattern ${today.pattern}`,
  //   `Lucky Zone 1: ${today.luckyZone1}`,
  //   `Lucky Zone 2: ${today.luckyZone2}`,
  //   "",
  //   `พรุ่งนี้ (${formatDiscordDate(tomorrow)}) - Pattern ${tomorrow.pattern}`,
  //   `Lucky Zone 1: ${tomorrow.luckyZone1}`,
  //   `Lucky Zone 2: ${tomorrow.luckyZone2}`
  // ].join("\n")

  return [
    "**Lucky Zone Dungeon วันนี้ / พรุ่งนี้**",
    `วันนี้ (${formatDiscordDate(today)}) - Pattern ${today.pattern}`,
    `Lucky Zone: ${formatLuckyZoneDungeonName(today.luckyZone)}`,
    "",
    `พรุ่งนี้ (${formatDiscordDate(tomorrow)}) - Pattern ${tomorrow.pattern}`,
    `Lucky Zone: ${formatLuckyZoneDungeonName(tomorrow.luckyZone)}`
  ].join("\n")
}

async function loadLuckyZoneState() {
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
    if (typeof parsed.lastProcessedDateKey === "string") {
      lastProcessedDateKey = parsed.lastProcessedDateKey
    }
  } catch (error) {
    console.error("Failed to parse lucky zone dungeon state.")
    console.error(error)
  }
}

async function saveLuckyZoneState(dateKey) {
  const state = {
    lastProcessedDateKey: dateKey,
    updatedAt: new Date().toISOString()
  }

  await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true })
  await fs.writeFile(STATE_FILE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

async function processLuckyZoneDungeonAnnouncement(client, date = new Date()) {
  await loadLuckyZoneState()

  const current = getBangkokDateParts(date)

  if (
    current.hour !== LUCKY_ZONE_START_HOUR
    || current.minute < LUCKY_ZONE_START_MINUTE
    || current.minute > LUCKY_ZONE_END_MINUTE
  ) {
    return { skipped: true, reason: "not_target_time" }
  }

  if (lastProcessedDateKey === current.dateKey) {
    return { skipped: true, reason: "already_processed" }
  }

  if (luckyZoneRunning) {
    return { skipped: true, reason: "already_running" }
  }

  luckyZoneRunning = true

  try {
    const guildId = getLuckyZoneGuildId()
    if (!guildId) {
      return { skipped: true, reason: "guild_id_not_configured" }
    }

    const guild = client.guilds.cache.get(guildId)
      || await client.guilds.fetch(guildId).catch(() => null)

    if (!guild) {
      return { skipped: true, reason: "guild_not_found" }
    }

    const channel = await client.channels.fetch(LUCKY_ZONE_CHANNEL_ID).catch(() => null)
    if (!channel || !channel.isTextBased()) {
      return { skipped: true, reason: "channel_not_text_based" }
    }

    if (channel.guildId !== guild.id) {
      return { skipped: true, reason: "guild_mismatch" }
    }

    await channel.send({
      content: buildLuckyZoneDungeonMessage(date)
    })

    lastProcessedDateKey = current.dateKey
    await saveLuckyZoneState(current.dateKey)

    return { skipped: false, dateKey: current.dateKey }
  } finally {
    luckyZoneRunning = false
  }
}

function startLuckyZoneDungeonLoop(client, intervalMs = DEFAULT_INTERVAL_MS) {
  if (luckyZoneInterval) {
    return luckyZoneInterval
  }

  processLuckyZoneDungeonAnnouncement(client).catch((error) => {
    console.error("Failed to process lucky zone dungeon announcement.")
    console.error(error)
  })

  luckyZoneInterval = setInterval(() => {
    processLuckyZoneDungeonAnnouncement(client).catch((error) => {
      console.error("Failed to process lucky zone dungeon announcement.")
      console.error(error)
    })
  }, intervalMs)

  if (typeof luckyZoneInterval.unref === "function") {
    luckyZoneInterval.unref()
  }

  return luckyZoneInterval
}

module.exports = {
  buildLuckyZoneDungeonMessage,
  getBangkokDateParts,
  getLuckyZoneDungeonForDate,
  getPatternIndex,
  processLuckyZoneDungeonAnnouncement,
  startLuckyZoneDungeonLoop
}
