const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")
const { setPartyAdminRole } = require("../services/guildConfigService")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setpartyadminrole")
    .setDescription("Set the role allowed to bypass party leader/creator checks")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Role that can manage parties and schedules like an admin")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const role = interaction.options.getRole("role")

    await setPartyAdminRole({
      guildId: interaction.guildId,
      adminRoleId: role.id
    })

    await interaction.reply({
      content: `Party admin role saved for this guild: ${role}`,
      flags: MessageFlags.Ephemeral
    })
  }
}
