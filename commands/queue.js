const { SlashCommandBuilder } = require('discord.js')
const musicService = require('../services/musicService')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show queue'),

  async execute(interaction) {
    const queue = musicService.getQueue()

    if (queue.length === 0) {
      await interaction.reply('No songs in queue')
      return
    }

    const lines = queue.map((song, i) => `${i + 1}. ${song}`)
    await interaction.reply(`Current queue:\n${lines.join('\n')}`)
  }
}
