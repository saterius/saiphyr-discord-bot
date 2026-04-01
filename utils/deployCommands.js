require("dotenv").config()

const {
  clearGlobalCommands,
  clearGuildCommands,
  deployGlobalCommands,
  deployGuildCommands,
  getGuildIds,
  getRestClient,
  loadCommands,
  shouldDeployGlobal,
  shouldDeployToGuilds
} = require("./commandRegistry")

module.exports = async () => {
  const commands = loadCommands()
  const rest = getRestClient()
  const guildIds = getGuildIds()
  const deployToGuilds = shouldDeployToGuilds()
  const deployGlobal = shouldDeployGlobal()

  try {
    console.log("Clearing command registries before deploy...")

    await clearGlobalCommands(rest)

    if (guildIds.length > 0) {
      await clearGuildCommands(rest, guildIds)
    }

    console.log("Deploying commands...")

    if (deployToGuilds && guildIds.length > 0) {
      console.log(`Deploying guild commands to ${guildIds.length} guild(s)...`)
      await deployGuildCommands(rest, guildIds, commands)
    } else {
      console.log("Deploying global commands...")
      await deployGlobalCommands(rest, commands)
    }

    if (deployGlobal) {
      console.log("DEPLOY_GLOBAL=true -> deploying global commands too")
      await deployGlobalCommands(rest, commands)
    }

    console.log("Commands deployed")
  } catch (error) {
    console.error("Deploy failed", error)
  }
}
