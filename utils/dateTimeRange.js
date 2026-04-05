const ServiceError = require("../services/serviceError")

const BANGKOK_OFFSET_HOURS = 7

function buildBangkokUnixTimestamp(year, month, day, hour, minute, errorCode = "INVALID_DATETIME") {
  const utcMillis = Date.UTC(year, month - 1, day, hour - BANGKOK_OFFSET_HOURS, minute, 0, 0)
  const bangkokDate = new Date(utcMillis + (BANGKOK_OFFSET_HOURS * 60 * 60 * 1000))

  if (
    bangkokDate.getUTCFullYear() !== year ||
    bangkokDate.getUTCMonth() !== month - 1 ||
    bangkokDate.getUTCDate() !== day ||
    bangkokDate.getUTCHours() !== hour ||
    bangkokDate.getUTCMinutes() !== minute
  ) {
    throw new ServiceError(
      "รูปแบบของวันที่หรือเวลาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
      errorCode,
      { year, month, day, hour, minute }
    )
  }

  return Math.floor(utcMillis / 1000)
}

function formatBangkokDateText(year, month, day, hour, minute) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (Asia/Bangkok)`
}

function getBangkokDateParts(unix) {
  const date = new Date((unix + (BANGKOK_OFFSET_HOURS * 60 * 60)) * 1000)

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  }
}

function parseBangkokDateTimeRange(input, {
  errorCode = "INVALID_DATETIME_RANGE",
  required = false,
  label = "ช่วงเวลา",
  defaultDurationMinutes = 30
} = {}) {
  const raw = String(input || "").trim()

  if (!raw) {
    if (!required) {
      return null
    }

    throw new ServiceError(
      `${label}ต้องใช้รูปแบบ DD-MM-YYYY hh:mm-hh:mm`,
      errorCode
    )
  }

  const match = raw.match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2})[:.](\d{2})(?:\s*-\s*(\d{2})[:.](\d{2}))?$/
  )

  if (!match) {
    throw new ServiceError(
      `${label}ไม่ถูกต้อง รูปแบบที่ถูกต้องคือ DD-MM-YYYY hh:mm-hh:mm เช่น 05-04-2026 21:30-22:30${defaultDurationMinutes ? " ถ้าลืมใส่เวลาจบ ระบบจะนับเพิ่มให้อัตโนมัติ 30 นาที" : ""}`,
      errorCode,
      { input: raw }
    )
  }

  const [, dayText, monthText, yearText, startHourText, startMinuteText, endHourText, endMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const startHour = Number(startHourText)
  const startMinute = Number(startMinuteText)
  const endHour = Number(endHourText)
  const endMinute = Number(endMinuteText)

  const startAtUnix = buildBangkokUnixTimestamp(year, month, day, startHour, startMinute, errorCode)
  const hasExplicitEnd = endHourText !== undefined && endMinuteText !== undefined
  const endAtUnix = hasExplicitEnd
    ? buildBangkokUnixTimestamp(year, month, day, endHour, endMinute, errorCode)
    : startAtUnix + (defaultDurationMinutes * 60)
  const endParts = getBangkokDateParts(endAtUnix)

  if (endAtUnix <= startAtUnix) {
    throw new ServiceError(
      `${label}ต้องมีเวลาจบหลังเวลาเริ่ม`,
      errorCode,
      { input: raw, startAtUnix, endAtUnix }
    )
  }

  return {
    raw,
    startAtUnix,
    endAtUnix,
    proposedStartAt: formatBangkokDateText(year, month, day, startHour, startMinute),
    proposedEndAt: formatBangkokDateText(endParts.year, endParts.month, endParts.day, endParts.hour, endParts.minute),
    timezone: "Asia/Bangkok",
    usedDefaultEndTime: !hasExplicitEnd
  }
}

module.exports = {
  buildBangkokUnixTimestamp,
  formatBangkokDateText,
  parseBangkokDateTimeRange
}
