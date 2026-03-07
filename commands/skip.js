const { SlashCommandBuilder } = require("discord.js");
const musicService = require("../services/musicService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip song"),

    async execute(interaction) {

        musicService.skip();

        await interaction.reply("⏭ Skipped");
    }
};