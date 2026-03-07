require("dotenv").config()

const { REST, Routes } = require("discord.js")
const fs = require("fs")
const path = require("path")

module.exports = async () => {

  const commands = []

  const commandsPath = path.join(__dirname, "../commands")
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"))

  for (const file of commandFiles) {

    const command = require(path.join(commandsPath, file))

    if (command.data) {
      commands.push(command.data.toJSON())
    }

  }

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN)
  const guildIds = (process.env.GUILD_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)
  const singleGuildId = (process.env.GUILD_ID || "").trim()
  const deployGlobal = String(process.env.DEPLOY_GLOBAL || "").toLowerCase() === "true"
  const deployToGuilds = String(process.env.DEPLOY_TO_GUILDS || "").toLowerCase() === "true"

  try {

    console.log("🚀 Deploying commands...")

    if (deployToGuilds && guildIds.length > 0) {

      console.log(`📍 Deploying guild commands (instant) to ${guildIds.length} guild(s)`)

      for (const guildId of guildIds) {
        await rest.put(
          Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            guildId
          ),
          { body: commands }
        )
      }

    } else if (deployToGuilds && singleGuildId) {

      console.log("📍 Deploying guild commands (instant)")

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          singleGuildId
        ),
        { body: commands }
      )

    } else {

      console.log("🌍 Deploying global commands (default)")

      await rest.put(
        Routes.applicationCommands(
          process.env.CLIENT_ID
        ),
        { body: commands }
      )

    }

    if (deployGlobal) {
      console.log("🌍 DEPLOY_GLOBAL=true -> deploying global commands too")
      await rest.put(
        Routes.applicationCommands(
          process.env.CLIENT_ID
        ),
        { body: commands }
      )
    }

    console.log("✅ Commands deployed")

  } catch (error) {

    console.error("❌ Deploy failed", error)

  }

}
