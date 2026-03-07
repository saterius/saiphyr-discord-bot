require("dotenv").config()

const { Client, GatewayIntentBits } = require("discord.js")

const loadCommands = require("./utils/commandLoader")
const loadEvents = require("./utils/eventLoader")
const deployCommands = require("./utils/deployCommands")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
})

loadCommands(client)
loadEvents(client)

client.once("ready", async () => {

  console.log(`🚀 Logged in as ${client.user.tag}`)

  await deployCommands()

})

client.login(process.env.TOKEN)