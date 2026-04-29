const { ActivityType } = require("discord.js")

const ACTIVITY_CHANGE_INTERVAL_MS = 10 * 60 * 1000
const DEFAULT_STREAM_URL = "https://www.twitch.tv/discord"

const ACTIVITY_ROTATION = [
  {
    name: "กำลังหลับ",
    type: ActivityType.Streaming,
    url: DEFAULT_STREAM_URL
  },
  {
    name: "กำลังหิว",
    type: ActivityType.Watching
  },
  {
    name: "กำลังคิด",
    type: ActivityType.Listening
  },
  {
    name: "กำลังคลั่ง",
    type: ActivityType.Competing
  },
  {
    name: "กำลังปวดหัว",
    type: ActivityType.Playing
  }
]

function pickRandomActivity(previousIndex) {
  if (ACTIVITY_ROTATION.length <= 1) {
    return { activity: ACTIVITY_ROTATION[0], index: 0 }
  }

  let index = previousIndex
  while (index === previousIndex) {
    index = Math.floor(Math.random() * ACTIVITY_ROTATION.length)
  }

  return { activity: ACTIVITY_ROTATION[index], index }
}

function setRandomPresence(client, previousIndex = -1) {
  const { activity, index } = pickRandomActivity(previousIndex)
  const nextActivity = { ...activity }

  if (nextActivity.type === ActivityType.Streaming && !nextActivity.url) {
    nextActivity.url = DEFAULT_STREAM_URL
  }

  client.user.setPresence({
    status: "online",
    activities: [nextActivity]
  })

  return index
}

module.exports = {
  name: "clientReady",
  once: true,

  execute(client) {
    console.log(`Logged in as ${client.user.tag}`)

    let currentActivityIndex = setRandomPresence(client)

    setInterval(() => {
      currentActivityIndex = setRandomPresence(client, currentActivityIndex)
    }, ACTIVITY_CHANGE_INTERVAL_MS)
  }
}
