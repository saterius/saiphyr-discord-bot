require("dotenv").config()

const {
  clearGuildCommands,
  getGuildIds,
  getRestClient
} = require("./utils/commandRegistry")

;(async () => {
  try {
    const rest = getRestClient()
    const guildIds = getGuildIds()

    if (guildIds.length === 0) {
      throw new Error("No GUILD_IDS or GUILD_ID configured.")
    }

    console.log(`Clearing guild commands for ${guildIds.length} guild(s)...`)
    await clearGuildCommands(rest, guildIds)
    console.log("Guild commands cleared")
  } catch (error) {
    console.error(error)
  }
})()
