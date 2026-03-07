const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/voiceChannels.json");
const dataDir = path.dirname(dataPath);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-voice")
    .setDescription("Set a voice channel as the lobby for creating rooms")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Voice channel to use as lobby")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");

    let data = {};
    try {
      if (fs.existsSync(dataPath)) {
        data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      }
    } catch (error) {
      console.error("Failed to read voiceChannels.json:", error);
      data = {};
    }

    data[interaction.guild.id] = channel.id;

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    await interaction.reply({
      content: `Voice lobby set to ${channel}`,
      ephemeral: true
    });
  }
};
