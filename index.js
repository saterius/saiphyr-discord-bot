require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Voice room service
const voiceRoom = require("./services/voiceRoomService");

client.on("voiceStateUpdate", (oldState, newState) => {
  voiceRoom.handleVoiceUpdate(oldState, newState);
});

const interactionCreate = require("./events/interactionCreate");

client.on("interactionCreate", interactionCreate);

client.once("ready", () => {

    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);