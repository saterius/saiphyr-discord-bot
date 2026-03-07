const { SlashCommandBuilder } = require('discord.js')
const musicService = require('../services/musicService')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show queue'),

  async execute(interaction) {
    musicService.getQueue(interaction)
  }
}