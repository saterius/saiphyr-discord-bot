const { SlashCommandBuilder } = require("discord.js");
const musicService = require("../services/musicService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Leave voice"),

    async execute(interaction) {

        musicService.leave();

        await interaction.reply("👋 Left voice channel");
    }
};