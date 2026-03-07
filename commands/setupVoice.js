const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require("discord.js")
const fs = require("fs")
const path = require("path")

const dataPath = path.join(__dirname, "../data/voiceChannels.json")

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

    const channel = interaction.options.getChannel("channel")

    // ทำงานกับไฟล์
    const fs = require("fs")
    const path = require("path")

    const dataPath = path.join(__dirname, "../data/voiceChannels.json")

    let data = {}

    if (fs.existsSync(dataPath)) {
        data = JSON.parse(fs.readFileSync(dataPath))
    }

    data[interaction.guild.id] = channel.id

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))

    await interaction.reply({
        content: `✅ Voice lobby set to ${channel}`,
        ephemeral: true
    })

}
}