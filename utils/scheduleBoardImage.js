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
const UNSCHEDULED_WIDTH = 420
const LEGEND_HEIGHT = 58
const HEADER_HEIGHT = 80
const WEEK_LABEL_HEIGHT = 68
const PADDING = 28
const CARD_PADDING_X = 14
const CARD_PADDING_Y = 12
const UNSCHEDULED_GAP = 18
const UNSCHEDULED_ITEM_HEIGHT = 74
const UNSCHEDULED_ITEM_GAP = 12
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
  completedCardStroke: "#1b5e20",
  unscheduledPanel: "#fff7ed",
  unscheduledHeader: "#9a3412",
  unscheduledCard: "#ffffff",
  unscheduledCardStroke: "#fed7aa",
  unscheduledText: "#7c2d12"
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

function getCurrentScheduleBoardRange(nowUnix = Math.floor(Date.now() / 1000)) {
  const rangeStartUnix = startOfWeekSaturday(startOfBangkokDay(nowUnix))
  const rangeEndUnix = rangeStartUnix + (7 * DAY_SECONDS)

  return {
    rangeStartUnix,
    rangeEndUnix
  }
}

function expandScheduleBoardRange(range = getCurrentScheduleBoardRange(), weekCount = 2) {
  return {
    rangeStartUnix: range.rangeStartUnix,
    rangeEndUnix: range.rangeStartUnix + (Math.max(1, weekCount) * 7 * DAY_SECONDS)
  }
}

function isScheduleBoardEntryInRange(entry, range = getCurrentScheduleBoardRange()) {
  return Number.isFinite(entry?.start_at_unix)
    && entry.start_at_unix >= range.rangeStartUnix
    && entry.start_at_unix < range.rangeEndUnix
}

function filterScheduleBoardEntriesForRange(entries, range = getCurrentScheduleBoardRange()) {
  return entries.filter((entry) => isScheduleBoardEntryInRange(entry, range))
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

function buildRollingSection(entries, range = getCurrentScheduleBoardRange()) {
  const { rangeStartUnix, rangeEndUnix } = range
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

function buildWeeklySections(entries, range = getCurrentScheduleBoardRange()) {
  const totalDays = Math.max(7, Math.ceil((range.rangeEndUnix - range.rangeStartUnix) / DAY_SECONDS))
  const weekCount = Math.max(1, Math.ceil(totalDays / 7))
  const sections = []

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const rangeStartUnix = range.rangeStartUnix + (weekIndex * 7 * DAY_SECONDS)
    const rangeEndUnix = Math.min(range.rangeEndUnix, rangeStartUnix + (7 * DAY_SECONDS))

    sections.push(buildRollingSection(entries, {
      rangeStartUnix,
      rangeEndUnix
    }))
  }

  return sections
}

function sortUnscheduledParties(unscheduledParties) {
  return Array.isArray(unscheduledParties)
    ? [...unscheduledParties].sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    : null
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

function createSvgLeftText({ lines, x, y, width, height, fontSize, fill, weight = 400, lineHeight = 1.25 }) {
  const safeLines = (lines || []).filter(Boolean)
  const fontFamily = `'${FONT_FAMILY}', Tahoma, sans-serif`
  const totalTextHeight = safeLines.length * fontSize * lineHeight
  const startY = y + ((height - totalTextHeight) / 2) + fontSize
  const tspanNodes = safeLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : fontSize * lineHeight
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join("")

  return `
    <text
      x="${x}"
      y="${startY}"
      fill="${fill}"
      font-family="${fontFamily}"
      font-size="${fontSize}"
      font-weight="${weight}"
      text-anchor="start"
    >${tspanNodes}</text>
  `
}

function getUnscheduledTitle() {
  return "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e19\u0e31\u0e14\u0e40\u0e27\u0e25\u0e32"
}

function getUnscheduledEmptyText() {
  return "\u0e04\u0e23\u0e1a\u0e41\u0e25\u0e49\u0e27"
}

function renderUnscheduledSidebar(parts, section, layout) {
  const { height, sidebarX, sidebarY, sidebarHeight } = layout
  const unscheduledParties = section.unscheduledParties || []
  const titleHeight = 66
  const contentX = sidebarX + 18
  const contentWidth = UNSCHEDULED_WIDTH - 36
  const listY = sidebarY + titleHeight + 14
  const maxItems = Math.max(0, Math.floor((sidebarHeight - titleHeight - 24) / (UNSCHEDULED_ITEM_HEIGHT + UNSCHEDULED_ITEM_GAP)))
  const visibleParties = unscheduledParties.slice(0, maxItems)
  const remainingCount = Math.max(0, unscheduledParties.length - visibleParties.length)

  parts.push(`
    <rect x="${sidebarX}" y="${sidebarY}" width="${UNSCHEDULED_WIDTH}" height="${sidebarHeight}" rx="18" fill="${COLORS.unscheduledPanel}" />
    <rect x="${sidebarX}" y="${sidebarY}" width="${UNSCHEDULED_WIDTH}" height="${titleHeight}" rx="18" fill="${COLORS.unscheduledHeader}" />
    <rect x="${sidebarX}" y="${sidebarY + titleHeight - 18}" width="${UNSCHEDULED_WIDTH}" height="18" fill="${COLORS.unscheduledHeader}" />
  `)

  parts.push(createSvgText({
    text: `${getUnscheduledTitle()} (${unscheduledParties.length})`,
    x: sidebarX,
    y: sidebarY,
    width: UNSCHEDULED_WIDTH,
    height: titleHeight,
    fontSize: 26,
    fill: COLORS.headerText,
    weight: 700
  }))

  if (!visibleParties.length) {
    parts.push(createSvgText({
      text: getUnscheduledEmptyText(),
      x: contentX,
      y: listY,
      width: contentWidth,
      height: Math.max(80, height - listY - PADDING),
      fontSize: 28,
      fill: COLORS.muted,
      weight: 700
    }))
    return
  }

  visibleParties.forEach((party, index) => {
    const itemY = listY + (index * (UNSCHEDULED_ITEM_HEIGHT + UNSCHEDULED_ITEM_GAP))
    const label = party.name || "#"
    const labelLines = wrapLabel(label, 26, 2)

    parts.push(`
      <rect
        x="${contentX}"
        y="${itemY}"
        width="${contentWidth}"
        height="${UNSCHEDULED_ITEM_HEIGHT}"
        rx="10"
        fill="${COLORS.unscheduledCard}"
        stroke="${COLORS.unscheduledCardStroke}"
        stroke-width="2"
      />
    `)

    parts.push(createSvgLeftText({
      x: contentX + 16,
      y: itemY + 8,
      width: contentWidth - 32,
      height: UNSCHEDULED_ITEM_HEIGHT - 16,
      lines: labelLines,
      fontSize: labelLines.length > 1 ? 20 : 24,
      fill: COLORS.unscheduledText,
      weight: 700,
      lineHeight: 1.18
    }))
  })

  if (remainingCount > 0) {
    const moreY = listY + (visibleParties.length * (UNSCHEDULED_ITEM_HEIGHT + UNSCHEDULED_ITEM_GAP))
    parts.push(createSvgText({
      text: `+${remainingCount} more`,
      x: contentX,
      y: moreY,
      width: contentWidth,
      height: 40,
      fontSize: 22,
      fill: COLORS.muted,
      weight: 700
    }))
  }
}

function renderStatusLegend(parts, layout) {
  const { x, y, width } = layout
  const items = [
    {
      label: "\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19\u0e41\u0e25\u0e49\u0e27",
      fill: COLORS.completedCard,
      stroke: COLORS.completedCardStroke
    },
    {
      label: "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e27\u0e15",
      fill: COLORS.reservedCard,
      stroke: COLORS.reservedCardStroke
    },
    {
      label: "\u0e25\u0e47\u0e2d\u0e01\u0e40\u0e27\u0e25\u0e32\u0e41\u0e25\u0e49\u0e27",
      fill: COLORS.card,
      stroke: COLORS.cardStroke
    }
  ]
  const fontFamily = `'${FONT_FAMILY}', Tahoma, sans-serif`
  const itemWidth = 270
  const itemGap = 26
  const totalWidth = (items.length * itemWidth) + ((items.length - 1) * itemGap)
  let itemX = x + Math.max(18, width - totalWidth - 24)

  parts.push(`
    <rect x="${x}" y="${y}" width="${width}" height="${LEGEND_HEIGHT}" rx="18" fill="${COLORS.panel}" />
    <rect x="${x}" y="${y + LEGEND_HEIGHT - 18}" width="${width}" height="18" fill="${COLORS.panel}" />
    <text
      x="${x + 24}"
      y="${y + 37}"
      fill="${COLORS.muted}"
      font-family="${fontFamily}"
      font-size="22"
      font-weight="700"
      text-anchor="start"
    >${escapeXml("\u0e04\u0e33\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22\u0e2a\u0e35")}</text>
  `)

  items.forEach((item) => {
    parts.push(`
      <rect x="${itemX}" y="${y + 16}" width="28" height="28" rx="6" fill="${item.fill}" stroke="${item.stroke}" stroke-width="2" />
      <text
        x="${itemX + 40}"
        y="${y + 38}"
        fill="${COLORS.text}"
        font-family="${fontFamily}"
        font-size="22"
        font-weight="700"
        text-anchor="start"
      >${escapeXml(item.label)}</text>
    `)
    itemX += itemWidth + itemGap
  })
}

function buildSvg(section) {
  const hasUnscheduledSidebar = Array.isArray(section.unscheduledParties)
  const width = PADDING * 2 + TIME_WIDTH + (DAY_WIDTH * 7) + (hasUnscheduledSidebar ? UNSCHEDULED_GAP + UNSCHEDULED_WIDTH : 0)
  const height = PADDING * 2 + LEGEND_HEIGHT + HEADER_HEIGHT + WEEK_LABEL_HEIGHT + (section.slots.length * CELL_HEIGHT)
  const gridX = PADDING + TIME_WIDTH
  const headerY = PADDING + LEGEND_HEIGHT
  const weekLabelY = headerY + HEADER_HEIGHT
  const gridY = weekLabelY + WEEK_LABEL_HEIGHT
  const tableBottomY = height - PADDING
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
  `)

  renderStatusLegend(parts, {
    x: PADDING,
    y: PADDING,
    width: sectionWidth
  })

  parts.push(`
      <rect x="${PADDING}" y="${headerY}" width="${sectionWidth}" height="${HEADER_HEIGHT}" rx="18" fill="${COLORS.header}" />
      <rect x="${PADDING}" y="${headerY + HEADER_HEIGHT - 18}" width="${sectionWidth}" height="18" fill="${COLORS.header}" />
  `)

  parts.push(createSvgText({
    text: formatThaiRangeLabel(section.rangeStartUnix, section.rangeEndUnix),
    x: PADDING,
    y: headerY,
    width: sectionWidth,
    height: HEADER_HEIGHT,
    fontSize: 40,
    fill: COLORS.headerText,
    weight: 700
  }))

  parts.push(`
    <rect x="${PADDING}" y="${weekLabelY}" width="${sectionWidth}" height="${WEEK_LABEL_HEIGHT}" fill="${COLORS.panel}" />
    <line x1="${PADDING}" y1="${weekLabelY}" x2="${PADDING + sectionWidth}" y2="${weekLabelY}" stroke="${COLORS.grid}" stroke-width="2" />
    <line x1="${PADDING}" y1="${gridY}" x2="${PADDING + sectionWidth}" y2="${gridY}" stroke="${COLORS.grid}" stroke-width="2" />
    <line x1="${PADDING + TIME_WIDTH}" y1="${weekLabelY}" x2="${PADDING + TIME_WIDTH}" y2="${tableBottomY}" stroke="${COLORS.grid}" stroke-width="2" />
  `)

  parts.push(createSvgText({
    text: "เวลา",
    x: PADDING,
    y: weekLabelY,
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
      <line x1="${dayX}" y1="${weekLabelY}" x2="${dayX}" y2="${tableBottomY}" stroke="${COLORS.grid}" stroke-width="2" />
    `)
    parts.push(createSvgText({
      text: formatThaiDayLabel(dayUnix),
      x: dayX,
      y: weekLabelY,
      width: DAY_WIDTH,
      height: WEEK_LABEL_HEIGHT,
      fontSize: 28,
      fill: COLORS.text,
      weight: 700
    }))
  }

  parts.push(`
    <line x1="${PADDING + sectionWidth}" y1="${weekLabelY}" x2="${PADDING + sectionWidth}" y2="${tableBottomY}" stroke="${COLORS.grid}" stroke-width="2" />
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
    <line x1="${PADDING}" y1="${tableBottomY}" x2="${PADDING + sectionWidth}" y2="${tableBottomY}" stroke="${COLORS.grid}" stroke-width="2" />
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

  if (hasUnscheduledSidebar) {
    renderUnscheduledSidebar(parts, section, {
      height,
      sidebarX: PADDING + sectionWidth + UNSCHEDULED_GAP,
      sidebarY: PADDING,
      sidebarHeight: height - (PADDING * 2)
    })
  }

  parts.push("</svg>")
  return {
    svg: parts.join("\n"),
    width,
    height
  }
}

async function createScheduleBoardImage(entries, {
  range = getCurrentScheduleBoardRange(),
  unscheduledParties = null,
  unscheduledPartiesByRange = null
} = {}) {
  const sortedEntries = [...entries]
    .filter((entry) => Number.isFinite(entry.start_at_unix))
    .sort((a, b) => a.start_at_unix - b.start_at_unix)
  const sortedUnscheduledParties = sortUnscheduledParties(unscheduledParties)
  const sortedUnscheduledPartiesByRange = Array.isArray(unscheduledPartiesByRange)
    ? unscheduledPartiesByRange.map(sortUnscheduledParties)
    : null
  const hasUnscheduledParties = sortedUnscheduledPartiesByRange
    ? sortedUnscheduledPartiesByRange.some((parties) => parties?.length)
    : Boolean(sortedUnscheduledParties?.length)

  if (!sortedEntries.length && !hasUnscheduledParties) {
    return null
  }

  const sections = buildWeeklySections(sortedEntries, range)
  const renderedSections = await Promise.all(sections.map(async (section, index) => {
    const sectionUnscheduledParties = sortedUnscheduledPartiesByRange
      ? sortedUnscheduledPartiesByRange[index] || []
      : sortedUnscheduledParties
    const { svg, width, height } = buildSvg({
      ...section,
      unscheduledParties: sectionUnscheduledParties
    })

    return {
      buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
      width,
      height
    }
  }))

  const sectionGap = sections.length > 1 ? 24 : 0
  const width = Math.max(...renderedSections.map((section) => section.width))
  const height = renderedSections.reduce((total, section) => total + section.height, 0)
    + (sectionGap * Math.max(0, renderedSections.length - 1))
  let top = 0
  const composites = renderedSections.map((section) => {
    const composite = {
      input: section.buffer,
      left: Math.floor((width - section.width) / 2),
      top
    }
    top += section.height + sectionGap
    return composite
  })
  const buffer = renderedSections.length === 1
    ? renderedSections[0].buffer
    : await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: COLORS.background
      }
    })
      .composite(composites)
      .png()
      .toBuffer()

  return {
    buffer,
    name: "schedule-board.png"
  }
}

module.exports = {
  createScheduleBoardImage,
  expandScheduleBoardRange,
  filterScheduleBoardEntriesForRange,
  getCurrentScheduleBoardRange,
  isScheduleBoardEntryInRange
}
