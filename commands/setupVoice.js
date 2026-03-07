const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
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
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    const permissionScope = channel.parent || channel;
    const perms = permissionScope.permissionsFor(me);
    const canManageChannels = perms?.has(PermissionFlagsBits.ManageChannels);
    const canMoveMembers = perms?.has(PermissionFlagsBits.MoveMembers);

    if (!canManageChannels || !canMoveMembers) {
      await interaction.reply({
        content:
          "Bot lacks required permissions on this lobby/category: Manage Channels and Move Members.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

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
      flags: MessageFlags.Ephemeral
    });
  }
};
