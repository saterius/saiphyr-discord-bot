const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/voiceChannels.json");

module.exports = {
  name: "setup-voice",

  async execute(interaction) {

    if (!interaction.member.permissions.has("Administrator")) {
      return interaction.reply({
        content: "You must be admin to use this command.",
        ephemeral: true
      });
    }

    const channel = interaction.channel;

    const data = JSON.parse(fs.readFileSync(dataPath));

    data[interaction.guild.id] = channel.id;

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    await interaction.reply(`Lobby voice set to <#${channel.id}>`);

  }
};