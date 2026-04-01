require("dotenv").config()

const { REST, Routes } = require("discord.js")
const fs = require("fs")
const path = require("path")

function getRestClient() {
  return new REST({ version: "10" }).setToken(process.env.TOKEN)
}

function getGuildIds() {
  const guildIds = (process.env.GUILD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  if (guildIds.length > 0) {
    return guildIds
  }

  const singleGuildId = (process.env.GUILD_ID || "").trim()
  return singleGuildId ? [singleGuildId] : []
}

function shouldDeployToGuilds() {
  return String(process.env.DEPLOY_TO_GUILDS || "").toLowerCase() === "true"
}

function shouldDeployGlobal() {
  return String(process.env.DEPLOY_GLOBAL || "").toLowerCase() === "true"
}

function loadCommands() {
  const commands = []
  const commandsPath = path.join(__dirname, "../commands")
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file))

    if (command.data) {
      commands.push(command.data.toJSON())
    }
  }

  return commands
}

async function clearGlobalCommands(rest) {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: [] }
  )
}

async function clearGuildCommands(rest, guildIds) {
  for (const guildId of guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: [] }
    )
  }
}

async function deployGlobalCommands(rest, commands) {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  )
}

async function deployGuildCommands(rest, guildIds, commands) {
  for (const guildId of guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commands }
    )
  }
}

module.exports = {
  clearGlobalCommands,
  clearGuildCommands,
  deployGlobalCommands,
  deployGuildCommands,
  getGuildIds,
  getRestClient,
  loadCommands,
  shouldDeployGlobal,
  shouldDeployToGuilds
}
