const { SlashCommandBuilder } = require("discord.js");
const musicService = require("../services/musicService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play music")
        .addStringOption(option =>
            option
                .setName("song")
                .setDescription("YouTube URL or search")
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply();

        const query = interaction.options.getString("song");

        await musicService.play(interaction, query);
    }
};