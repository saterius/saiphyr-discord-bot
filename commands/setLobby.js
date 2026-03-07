const { SlashCommandBuilder } = require('discord.js');

let lobbyChannelId = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlobby')
    .setDescription('Set lobby voice channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Lobby voice channel')
        .setRequired(true)
    ),

  async execute(interaction) {

    const channel = interaction.options.getChannel('channel');

    lobbyChannelId = channel.id;

    await interaction.reply(`✅ Lobby set to ${channel.name}`);
  },

  getLobby() {
    return lobbyChannelId;
  }
};