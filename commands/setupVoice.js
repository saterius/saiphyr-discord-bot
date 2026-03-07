const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/voiceChannels.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-voice")
    .setDescription("Set this channel as the voice lobby")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {

    const data = JSON.parse(fs.readFileSync(dataPath));

    data[interaction.guild.id] = interaction.channel.id;

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    await interaction.reply({
      content: `Voice lobby set to <#${interaction.channel.id}>`,
      ephemeral: true
    });

  }
};