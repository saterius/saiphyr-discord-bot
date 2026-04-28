const { ActivityType } = require("discord.js")

module.exports = {
  name: "clientReady",
  once: true,

  execute(client) {
    console.log(`Logged in as ${client.user.tag}`)

    client.user.setPresence({
      status: "online",
      activities: [
        {
          name: "SaiphyR กำลังหลับ",
          type: ActivityType.Streaming,
          url: "https://www.twitch.tv/discord"
        }
      ]
    })
  }
}
