require("dotenv").config()

const { Client, GatewayIntentBits, Partials } = require("discord.js")

const loadCommands = require("./utils/commandLoader")
const loadEvents = require("./utils/eventLoader")
const deployCommands = require("./utils/deployCommands")
const { startDailyPartyRecruitmentRepostLoop } = require("./services/partyRecruitmentRepostService")
const { startScheduleReminderLoop } = require("./services/scheduleReminderService")

const client = new Client({
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
})

loadCommands(client)
loadEvents(client)

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`)

  await deployCommands()
  startScheduleReminderLoop(client)
  startDailyPartyRecruitmentRepostLoop(client)
})

client.login(process.env.TOKEN)
