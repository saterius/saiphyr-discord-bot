const { SlashCommandBuilder } = require("discord.js");
const musicService = require("../services/musicService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop music"),

    async execute(interaction) {

        musicService.stop();

        await interaction.reply("⏹ Stopped");
    }
};