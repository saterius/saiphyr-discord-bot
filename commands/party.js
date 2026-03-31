const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")

const partyService = require("../services/partyService")
const {
  refreshPartyRecruitmentMessage
} = require("../services/partyMessageService")
const {
  buildPartyActionRows,
  buildPartyEmbed
} = require("../utils/partyUi")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Manage Dragon Nest parties")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new recruitment post")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Party name")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Optional description for the party")
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post the recruitment message in")
            .addChannelTypes(ChannelType.GuildText)
        )
        .addIntegerOption((option) =>
          option
            .setName("max_members")
            .setDescription("Maximum members")
            .setMinValue(2)
            .setMaxValue(8)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show a party by ID")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List parties in this guild")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kick")
        .setDescription("Kick a member from your party")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to kick")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for kicking")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("Leave a party you are in")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for leaving")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close or cancel a party")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Final status")
            .setRequired(true)
            .addChoices(
              { name: "closed", value: "closed" },
              { name: "cancelled", value: "cancelled" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for closing")
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "create") {
      const targetChannel = interaction.options.getChannel("channel") || interaction.channel
      const name = interaction.options.getString("name")
      const description = interaction.options.getString("description")
      const maxMembers = interaction.options.getInteger("max_members") || 8

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const party = await partyService.createParty({
        guildId: interaction.guildId,
        leaderId: interaction.user.id,
        name,
        description,
        recruitChannelId: targetChannel.id,
        maxMembers
      })

      const recruitMessage = await targetChannel.send({
        embeds: [buildPartyEmbed(party)],
        components: buildPartyActionRows(party)
      })

      const updatedParty = await partyService.updatePartyResources({
        partyId: party.id,
        recruitChannelId: targetChannel.id,
        recruitMessageId: recruitMessage.id
      })

      await interaction.editReply({
        content: `Party created: #${updatedParty.id} in ${targetChannel}.`
      })

      return
    }

    if (subcommand === "show") {
      const partyId = interaction.options.getInteger("party_id")
      const party = await partyService.getPartyById(partyId)

      await interaction.reply({
        embeds: [buildPartyEmbed(party)],
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "list") {
      const parties = await partyService.listGuildParties(interaction.guildId)

      const content = parties.length
        ? parties
          .map((party) => `#${party.id} | ${party.name} | ${party.status} | ${party.active_member_count}/${party.max_members}`)
          .join("\n")
        : "No parties found in this guild."

      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "kick") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const member = interaction.options.getUser("member")
      const reason = interaction.options.getString("reason")

      const result = await partyService.kickPartyMember({
        partyId,
        actorId: interaction.user.id,
        targetUserId: member.id,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `${member} was removed from party #${partyId}.${result.reopenedRecruitment ? " Recruitment has reopened." : ""}`
      })

      return
    }

    if (subcommand === "leave") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const reason = interaction.options.getString("reason") || "left"

      const result = await partyService.leaveParty({
        partyId,
        userId: interaction.user.id,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `You left party #${partyId}.${result.reopenedRecruitment ? " Recruitment has reopened." : ""}`
      })

      return
    }

    if (subcommand === "close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const status = interaction.options.getString("status")
      const reason = interaction.options.getString("reason")

      await partyService.updatePartyStatus({
        partyId,
        actorId: interaction.user.id,
        status,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `Party #${partyId} updated to ${status}.`
      })
    }
  }
}
