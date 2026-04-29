const { ActivityType } = require("discord.js")

const ACTIVITY_CHANGE_INTERVAL_MS = 10 * 60 * 1000
const DEFAULT_STREAM_URL = "https://www.twitch.tv/discord"

const STATUS_ROTATION = [
  "online",
  "idle",
  "dnd"
]

const ACTIVITY_TYPE_ROTATION = [
  ActivityType.Streaming,
  ActivityType.Watching,
  ActivityType.Listening,
  ActivityType.Competing,
  ActivityType.Playing
]

const ACTIVITY_NAME_ROTATION = [
  "กำลังหลับ",
  "กำลังหิว",
  "กำลังคิด",
  "กำลังคลั่ง",
  "กำลังปวดหัว"
]

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function buildRandomPresence() {
  const status = pickRandomItem(STATUS_ROTATION)
  const type = pickRandomItem(ACTIVITY_TYPE_ROTATION)
  const activity = {
    name: pickRandomItem(ACTIVITY_NAME_ROTATION),
    type
  }

  if (type === ActivityType.Streaming) {
    activity.url = DEFAULT_STREAM_URL
  }

  return {
    status,
    activities: [activity]
  }
}

function setRandomPresence(client) {
  client.user.setPresence(buildRandomPresence())
}

module.exports = {
  name: "clientReady",
  once: true,

  execute(client) {
    console.log(`Logged in as ${client.user.tag}`)

    setRandomPresence(client)

    setInterval(() => {
      setRandomPresence(client)
    }, ACTIVITY_CHANGE_INTERVAL_MS)
  }
}
