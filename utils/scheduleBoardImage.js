const fs = require("node:fs")
const path = require("node:path")

const FONTCONFIG_DIR = path.join(__dirname, "..", "assets", "fontconfig")
const FONTCONFIG_FILE = path.join(FONTCONFIG_DIR, "fonts.conf")

if (!process.env.FONTCONFIG_PATH && fs.existsSync(FONTCONFIG_DIR)) {
  process.env.FONTCONFIG_PATH = FONTCONFIG_DIR
}

if (!process.env.FONTCONFIG_FILE && fs.existsSync(FONTCONFIG_FILE)) {
  process.env.FONTCONFIG_FILE = FONTCONFIG_FILE
}

const sharp = require("sharp")
const { SCHEDULE_STATUS } = require("../services/partyConstants")

const CELL_HEIGHT = 86
const DAY_WIDTH = 420
const TIME_WIDTH = 176
const HEADER_HEIGHT = 80
const WEEK_LABEL_HEIGHT = 68
const PADDING = 28
const CARD_PADDING_X = 14
const CARD_PADDING_Y = 12
const SLOT_SECONDS = 30 * 60
const DAY_SECONDS = 24 * 60 * 60
const BANGKOK_OFFSET_SECONDS = 7 * 60 * 60
const FONT_FAMILY = "ScheduleBoardThai"

const COLORS = {
  background: "#f5f7fb",
  panel: "#ffffff",
  text: "#1f2937",
  muted: "#5b6475",
  grid: "#d2d8e2",
  header: "#111827",
  headerText: "#ffffff",
  card: "#d61f69",
  cardAlt: "#c2185b",
  cardText: "#ffffff",
  cardStroke: "#7c1237",
  reservedCard: "#fff3bf",
  reservedCardAlt: "#ffe8a3",
  reservedCardText: "#4f3b00",
  reservedCardStroke: "#d6a400",
  completedCard: "#2f9e44",
  completedCardAlt: "#2b8a3e",
  completedCardText: "#ffffff",
  completedCardStroke: "#1b5e20"
}

const THAI_DAY_NAMES = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์"
]

const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค."
]

const FONT_PATHS = {
  regular: [
    path.join(__dirname, "..", "assets", "fonts", "LeelawUI.ttf"),
    "C:\\Windows\\Fonts\\LeelawUI.ttf",
    "C:\\Windows\\Fonts\\tahoma.ttf",
    "C:\\Windows\\Fonts\\leelawad.ttf"
  ],
  bold: [
    path.join(__dirname, "..", "assets", "fonts", "LeelaUIb.ttf"),
    "C:\\Windows\\Fonts\\LeelaUIb.ttf",
    "C:\\Windows\\Fonts\\tahomabd.ttf",
    "C:\\Windows\\Fonts\\leelawdb.ttf"
  ]
}

let embeddedFontsCss = null

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toBangkokDate(unix) {
  return new Date((unix + BANGKOK_OFFSET_SECONDS) * 1000)
}

function startOfBangkokDay(unix) {
  const date = toBangkokDate(unix)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), -7, 0, 0, 0) / 1000
}

function startOfWeekSaturday(dayStartUnix) {
  const date = toBangkokDate(dayStartUnix)
  const daysSinceSaturday = (date.getUTCDay() + 1) % 7
  return dayStartUnix - (daysSinceSaturday * DAY_SECONDS)
}

function getTimeOfDayMinutes(unix) {
  const date = toBangkokDate(unix)
  return (date.getUTCHours() * 60) + date.getUTCMinutes()
}

function formatMinutesLabel(totalMinutes) {
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function getEntryCardStyle(entry, index) {
  if (entry.status === SCHEDULE_STATUS.EXPIRED) {
    return {
      fill: index % 2 === 0 ? COLORS.completedCard : COLORS.completedCardAlt,
      stroke: COLORS.completedCardStroke,
      text: COLORS.completedCardText
    }
  }

  if (entry.status === SCHEDULE_STATUS.VOTING) {
    return {
      fill: index % 2 === 0 ? COLORS.reservedCard : COLORS.reservedCardAlt,
      stroke: COLORS.reservedCardStroke,
      text: COLORS.reservedCardText
    }
  }

  return {
    fill: index % 2 === 0 ? COLORS.card : COLORS.cardAlt,
    stroke: COLORS.cardStroke,
    text: COLORS.cardText
  }
}

function formatTimeRangeLabel(startMinutes) {
  return `${formatMinutesLabel(startMinutes)} - ${formatMinutesLabel(startMinutes + 30)}`
}

function formatThaiDayLabel(dayUnix) {
  const date = toBangkokDate(dayUnix)
  return `${THAI_DAY_NAMES[date.getUTCDay()]}ที่ ${date.getUTCDate()}`
}

function formatThaiRangeLabel(rangeStartUnix, rangeEndUnixExclusive) {
  const rangeEndUnix = rangeEndUnixExclusive - DAY_SECONDS
  const startDate = toBangkokDate(rangeStartUnix)
  const endDate = toBangkokDate(rangeEndUnix)
  const startLabel = `${startDate.getUTCDate()} ${THAI_MONTH_SHORT[startDate.getUTCMonth()]}`
  const endMonthLabel = THAI_MONTH_SHORT[endDate.getUTCMonth()]

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth()) {
    return `${startDate.getUTCDate()}-${endDate.getUTCDate()} ${endMonthLabel} ${endDate.getUTCFullYear()}`
  }

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${startLabel} - ${endDate.getUTCDate()} ${endMonthLabel} ${endDate.getUTCFullYear()}`
  }

  return `${startLabel} ${startDate.getUTCFullYear()} - ${endDate.getUTCDate()} ${endMonthLabel} ${endDate.getUTCFullYear()}`
}

function shouldUseOvernightTimeline(entries) {
  const hasEveningEntry = entries.some((entry) => entry.startMinutesOfDay >= (12 * 60))
  const hasAfterMidnightEntry = entries.some((entry) => entry.startMinutesOfDay < (3 * 60))
  return hasEveningEntry && hasAfterMidnightEntry
}

function normalizeDisplayMinutes(minutesOfDay, useOvernightTimeline) {
  if (useOvernightTimeline && minutesOfDay < (3 * 60)) {
    return minutesOfDay + (24 * 60)
  }

  return minutesOfDay
}

function sanitizeLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "#"
}

function splitLongToken(token, maxCharsPerLine) {
  const chunks = []
  let cursor = 0

  while (cursor < token.length) {
    chunks.push(token.slice(cursor, cursor + maxCharsPerLine))
    cursor += maxCharsPerLine
  }

  return chunks
}

function wrapLabel(text, maxCharsPerLine = 22, maxLines = 3) {
  const normalized = sanitizeLabel(text)
  const words = normalized.split(" ").filter(Boolean)

  if (!words.length) {
    return ["#"]
  }

  const lines = []
  let currentLine = ""

  for (const rawWord of words) {
    const wordParts = rawWord.length > maxCharsPerLine
      ? splitLongToken(rawWord, maxCharsPerLine)
      : [rawWord]

    for (const word of wordParts) {
      const candidate = currentLine ? `${currentLine} ${word}` : word

      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate
        continue
      }

      if (currentLine) {
        lines.push(currentLine)
      }

      currentLine = word

      if (lines.length === maxLines) {
        break
      }
    }

    if (lines.length === maxLines) {
      break
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine)
  }

  const consumed = lines.join(" ").length
  if (consumed < normalized.length && lines.length) {
    const lastIndex = lines.length - 1
    const base = lines[lastIndex].slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()
    lines[lastIndex] = `${base}…`
  }

  return lines.slice(0, maxLines)
}

function abbreviateLabel(text, maxLength = 18) {
  const normalized = sanitizeLabel(text)
  if (normalized.length <= maxLength) {
    return normalized
  }

  const words = normalized.split(" ").filter(Boolean)
  if (!words.length) {
    return normalized
  }

  const trailingNumber = /\d+$/.exec(normalized)?.[0] || ""
  const acronymParts = words
    .map((word) => {
      if (/^\d+$/.test(word)) {
        return word
      }

      return word[0]?.toUpperCase() || ""
    })
    .filter(Boolean)

  let abbreviated = acronymParts.join("")
  if (trailingNumber && !abbreviated.endsWith(trailingNumber)) {
    abbreviated = `${abbreviated} ${trailingNumber}`.trim()
  }

  if (abbreviated.length <= maxLength) {
    return abbreviated
  }

  return normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…"
}

function assignDayLanes(entries) {
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.normalizedStartMinutes !== b.normalizedStartMinutes) {
      return a.normalizedStartMinutes - b.normalizedStartMinutes
    }

    return a.normalizedEndMinutes - b.normalizedEndMinutes
  })

  const laneAssignments = new Map()
  let active = []
  let clusterEntries = []
  let nextLaneIndex = 0
  let clusterMaxLanes = 0
  let availableLaneIndexes = []

  function finalizeCluster() {
    if (!clusterEntries.length) {
      return
    }

    for (const entry of clusterEntries) {
      const assignment = laneAssignments.get(entry)
      assignment.laneCount = Math.max(1, clusterMaxLanes)
    }

    clusterEntries = []
    clusterMaxLanes = 0
    nextLaneIndex = 0
    availableLaneIndexes = []
  }

  for (const entry of sortedEntries) {
    const stillActive = []

    for (const activeEntry of active) {
      if (activeEntry.normalizedEndMinutes <= entry.normalizedStartMinutes) {
        availableLaneIndexes.push(laneAssignments.get(activeEntry).laneIndex)
      } else {
        stillActive.push(activeEntry)
      }
    }

    availableLaneIndexes.sort((a, b) => a - b)
    active = stillActive

    if (!active.length) {
      finalizeCluster()
    }

    const laneIndex = availableLaneIndexes.length ? availableLaneIndexes.shift() : nextLaneIndex
    if (laneIndex === nextLaneIndex) {
      nextLaneIndex += 1
    }

    laneAssignments.set(entry, {
      laneIndex,
      laneCount: 1
    })

    active.push(entry)
    clusterEntries.push(entry)
    clusterMaxLanes = Math.max(clusterMaxLanes, active.length)
  }

  finalizeCluster()

  return sortedEntries.map((entry) => ({
    ...entry,
    ...laneAssignments.get(entry)
  }))
}

function buildRollingSection(entries) {
  const rangeStartUnix = startOfWeekSaturday(startOfBangkokDay(Math.floor(Date.now() / 1000)))
  const rangeEndUnix = rangeStartUnix + (7 * DAY_SECONDS)
  const visibleEntries = entries
    .filter((entry) => Number.isFinite(entry.start_at_unix))
    .map((entry) => ({
      ...entry,
      end_at_unix: Number.isFinite(entry.end_at_unix) ? entry.end_at_unix : entry.start_at_unix + SLOT_SECONDS,
      dayStartUnix: startOfBangkokDay(entry.start_at_unix),
      startMinutesOfDay: getTimeOfDayMinutes(entry.start_at_unix)
    }))
    .filter((entry) => entry.start_at_unix >= rangeStartUnix && entry.start_at_unix < rangeEndUnix)

  const useOvernightTimeline = shouldUseOvernightTimeline(visibleEntries)
  const normalizedEntries = visibleEntries.map((entry) => {
    const normalizedStartMinutes = normalizeDisplayMinutes(entry.startMinutesOfDay, useOvernightTimeline)
    let normalizedEndMinutes = normalizeDisplayMinutes(getTimeOfDayMinutes(entry.end_at_unix), useOvernightTimeline)

    if (entry.end_at_unix > entry.start_at_unix) {
      const durationMinutes = Math.max(30, Math.ceil((entry.end_at_unix - entry.start_at_unix) / 60 / 30) * 30)
      normalizedEndMinutes = normalizedStartMinutes + durationMinutes
    } else if (normalizedEndMinutes <= normalizedStartMinutes) {
      normalizedEndMinutes = normalizedStartMinutes + 30
    }

    return {
      ...entry,
      normalizedStartMinutes,
      normalizedEndMinutes
    }
  })

  const entriesByDay = new Map()
  for (const entry of normalizedEntries) {
    const key = String(entry.dayStartUnix)
    if (!entriesByDay.has(key)) {
      entriesByDay.set(key, [])
    }

    entriesByDay.get(key).push(entry)
  }

  const laidOutEntries = []
  for (const dayEntries of entriesByDay.values()) {
    laidOutEntries.push(...assignDayLanes(dayEntries))
  }

  const displayStartMinutes = visibleEntries.length
    ? Math.floor(Math.min(...laidOutEntries.map((entry) => entry.normalizedStartMinutes)) / 30) * 30
    : (18 * 60)

  const displayEndMinutes = visibleEntries.length
    ? Math.max(
      Math.ceil(Math.max(...laidOutEntries.map((entry) => entry.normalizedEndMinutes)) / 30) * 30,
      useOvernightTimeline ? (26 * 60) : 0
    )
    : (24 * 60)

  const slots = []

  for (let minutes = displayStartMinutes; minutes < displayEndMinutes; minutes += 30) {
    slots.push(minutes)
  }

  return {
    rangeStartUnix,
    rangeEndUnix,
    entries: laidOutEntries,
    slots,
    displayStartMinutes
  }
}

function tryReadFont(paths) {
  for (const fontPath of paths) {
    if (!fs.existsSync(fontPath)) {
      continue
    }

    return {
      fontPath,
      data: fs.readFileSync(fontPath)
    }
  }

  return null
}

function getEmbeddedFontsCss() {
  if (embeddedFontsCss) {
    return embeddedFontsCss
  }

  const regularFont = tryReadFont(FONT_PATHS.regular)
  const boldFont = tryReadFont(FONT_PATHS.bold)
  const declarations = []

  if (regularFont) {
    declarations.push(`
      @font-face {
        font-family: '${FONT_FAMILY}';
        font-style: normal;
        font-weight: 400;
        src: url(data:font/ttf;base64,${regularFont.data.toString("base64")}) format('truetype');
      }
    `)
  }

  if (boldFont) {
    declarations.push(`
      @font-face {
        font-family: '${FONT_FAMILY}';
        font-style: normal;
        font-weight: 700;
        src: url(data:font/ttf;base64,${boldFont.data.toString("base64")}) format('truetype');
      }
    `)
  }

  embeddedFontsCss = declarations.join("\n")
  return embeddedFontsCss
}

function createSvgText({ text, x, y, width, height, fontSize, fill, weight = 400, lineHeight = 1.25, lines = null }) {
  const safeLines = (lines || [text]).filter(Boolean)
  const fontFamily = `'${FONT_FAMILY}', Tahoma, sans-serif`
  const totalTextHeight = safeLines.length * fontSize * lineHeight
  const startY = y + ((height - totalTextHeight) / 2) + fontSize
  const tspanNodes = safeLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : fontSize * lineHeight
      return `<tspan x="${x + (width / 2)}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join("")

  return `
    <text
      x="${x + (width / 2)}"
      y="${startY}"
      fill="${fill}"
      font-family="${fontFamily}"
      font-size="${fontSize}"
      font-weight="${weight}"
      text-anchor="middle"
    >${tspanNodes}</text>
  `
}

function buildSvg(section) {
  const width = PADDING * 2 + TIME_WIDTH + (DAY_WIDTH * 7)
  const height = PADDING * 2 + HEADER_HEIGHT + WEEK_LABEL_HEIGHT + (section.slots.length * CELL_HEIGHT)
  const gridX = PADDING + TIME_WIDTH
  const gridY = PADDING + HEADER_HEIGHT + WEEK_LABEL_HEIGHT
  const sectionWidth = TIME_WIDTH + (DAY_WIDTH * 7)
  const parts = []

  parts.push(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <style>
          ${getEmbeddedFontsCss()}
        </style>
      </defs>
      <rect width="${width}" height="${height}" rx="18" fill="${COLORS.background}" />
      <rect x="${PADDING}" y="${PADDING}" width="${sectionWidth}" height="${height - (PADDING * 2)}" rx="18" fill="${COLORS.panel}" />
      <rect x="${PADDING}" y="${PADDING}" width="${sectionWidth}" height="${HEADER_HEIGHT}" rx="18" fill="${COLORS.header}" />
      <rect x="${PADDING}" y="${PADDING + HEADER_HEIGHT - 18}" width="${sectionWidth}" height="18" fill="${COLORS.header}" />
  `)

  parts.push(createSvgText({
    text: formatThaiRangeLabel(section.rangeStartUnix, section.rangeEndUnix),
    x: PADDING,
    y: PADDING,
    width: sectionWidth,
    height: HEADER_HEIGHT,
    fontSize: 40,
    fill: COLORS.headerText,
    weight: 700
  }))

  parts.push(`
    <rect x="${PADDING}" y="${PADDING + HEADER_HEIGHT}" width="${sectionWidth}" height="${WEEK_LABEL_HEIGHT}" fill="${COLORS.panel}" />
    <line x1="${PADDING}" y1="${PADDING + HEADER_HEIGHT}" x2="${PADDING + sectionWidth}" y2="${PADDING + HEADER_HEIGHT}" stroke="${COLORS.grid}" stroke-width="2" />
    <line x1="${PADDING}" y1="${PADDING + HEADER_HEIGHT + WEEK_LABEL_HEIGHT}" x2="${PADDING + sectionWidth}" y2="${PADDING + HEADER_HEIGHT + WEEK_LABEL_HEIGHT}" stroke="${COLORS.grid}" stroke-width="2" />
    <line x1="${PADDING + TIME_WIDTH}" y1="${PADDING + HEADER_HEIGHT}" x2="${PADDING + TIME_WIDTH}" y2="${height - PADDING}" stroke="${COLORS.grid}" stroke-width="2" />
  `)

  parts.push(createSvgText({
    text: "เวลา",
    x: PADDING,
    y: PADDING + HEADER_HEIGHT,
    width: TIME_WIDTH,
    height: WEEK_LABEL_HEIGHT,
    fontSize: 32,
    fill: COLORS.text,
    weight: 700
  }))

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const dayUnix = section.rangeStartUnix + (dayIndex * DAY_SECONDS)
    const dayX = gridX + (dayIndex * DAY_WIDTH)
    parts.push(`
      <line x1="${dayX}" y1="${PADDING + HEADER_HEIGHT}" x2="${dayX}" y2="${height - PADDING}" stroke="${COLORS.grid}" stroke-width="2" />
    `)
    parts.push(createSvgText({
      text: formatThaiDayLabel(dayUnix),
      x: dayX,
      y: PADDING + HEADER_HEIGHT,
      width: DAY_WIDTH,
      height: WEEK_LABEL_HEIGHT,
      fontSize: 28,
      fill: COLORS.text,
      weight: 700
    }))
  }

  parts.push(`
    <line x1="${PADDING + sectionWidth}" y1="${PADDING + HEADER_HEIGHT}" x2="${PADDING + sectionWidth}" y2="${height - PADDING}" stroke="${COLORS.grid}" stroke-width="2" />
  `)

  for (let slotIndex = 0; slotIndex < section.slots.length; slotIndex += 1) {
    const slotY = gridY + (slotIndex * CELL_HEIGHT)
    parts.push(`
      <line x1="${PADDING}" y1="${slotY}" x2="${PADDING + sectionWidth}" y2="${slotY}" stroke="${COLORS.grid}" stroke-width="2" />
    `)
    parts.push(createSvgText({
      text: formatTimeRangeLabel(section.slots[slotIndex]),
      x: PADDING,
      y: slotY,
      width: TIME_WIDTH,
      height: CELL_HEIGHT,
      fontSize: 22,
      fill: COLORS.muted,
      weight: 400
    }))
  }

  parts.push(`
    <line x1="${PADDING}" y1="${height - PADDING}" x2="${PADDING + sectionWidth}" y2="${height - PADDING}" stroke="${COLORS.grid}" stroke-width="2" />
  `)

  section.entries.forEach((entry, index) => {
    const dayIndex = Math.floor((entry.dayStartUnix - section.rangeStartUnix) / DAY_SECONDS)
    if (dayIndex < 0 || dayIndex > 6) {
      return
    }

    const slotOffset = (entry.normalizedStartMinutes - section.displayStartMinutes) / 30
    const slotSpan = Math.max(1, (entry.normalizedEndMinutes - entry.normalizedStartMinutes) / 30)
    const laneGap = 8
    const laneCount = Math.max(1, entry.laneCount || 1)
    const usableDayWidth = DAY_WIDTH - 8
    const laneWidth = (usableDayWidth - ((laneCount - 1) * laneGap)) / laneCount
    const blockX = gridX + (dayIndex * DAY_WIDTH) + 4 + ((entry.laneIndex || 0) * (laneWidth + laneGap))
    const blockY = gridY + Math.round(slotOffset * CELL_HEIGHT) + 4
    const blockWidth = Math.max(96, Math.floor(laneWidth))
    const blockHeight = Math.max(CELL_HEIGHT - 8, Math.round(slotSpan * CELL_HEIGHT) - 8)
    const maxCharsPerLine = Math.max(8, Math.floor((blockWidth - 28) / 12))
    const rawLabel = entry.party_name || `#${entry.party_id || entry.id}`
    const compactLabel = laneCount >= 3 || blockWidth < 150
      ? abbreviateLabel(rawLabel, Math.max(10, maxCharsPerLine * 2))
      : rawLabel
    const labelLines = wrapLabel(compactLabel, maxCharsPerLine, 3)
    const fontSize = blockWidth < 170 ? 20 : labelLines.length >= 3 ? 22 : 28
    const cardStyle = getEntryCardStyle(entry, index)

    parts.push(`
      <rect
        x="${blockX}"
        y="${blockY}"
        width="${blockWidth}"
        height="${blockHeight}"
        fill="${cardStyle.fill}"
        stroke="${cardStyle.stroke}"
        stroke-width="2"
      />
    `)

    parts.push(createSvgText({
      x: blockX + CARD_PADDING_X,
      y: blockY + CARD_PADDING_Y,
      width: blockWidth - (CARD_PADDING_X * 2),
      height: blockHeight - (CARD_PADDING_Y * 2),
      lines: labelLines,
      fontSize,
      fill: cardStyle.text,
      weight: 700,
      lineHeight: 1.2
    }))
  })

  parts.push("</svg>")
  return {
    svg: parts.join("\n"),
    width,
    height
  }
}

async function createScheduleBoardImage(entries) {
  const sortedEntries = [...entries]
    .filter((entry) => Number.isFinite(entry.start_at_unix))
    .sort((a, b) => a.start_at_unix - b.start_at_unix)

  if (!sortedEntries.length) {
    return null
  }

  const section = buildRollingSection(sortedEntries)
  const { svg } = buildSvg(section)
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer()

  return {
    buffer,
    name: "schedule-board.png"
  }
}

module.exports = {
  createScheduleBoardImage
}
