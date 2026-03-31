const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js")

const dragonNestClasses = require("../data/dragonNestClasses")
const {
  CONFIRMATION_RESPONSE,
  PARTY_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_VOTE
} = require("../services/partyConstants")

function getClassOption(classKey) {
  return dragonNestClasses.find((job) => job.key === classKey) || null
}

function truncate(value, maxLength = 1024) {
  if (!value) {
    return "-"
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function partyStatusLabel(status) {
  const labels = {
    [PARTY_STATUS.RECRUITING]: "Recruiting",
    [PARTY_STATUS.PENDING_CONFIRM]: "Waiting Confirm",
    [PARTY_STATUS.ACTIVE]: "Active",
    [PARTY_STATUS.SCHEDULED]: "Scheduled",
    [PARTY_STATUS.CLOSED]: "Closed",
    [PARTY_STATUS.CANCELLED]: "Cancelled"
  }

  return labels[status] || status
}

function scheduleStatusLabel(status) {
  const labels = {
    [SCHEDULE_STATUS.VOTING]: "Voting",
    [SCHEDULE_STATUS.LOCKED]: "Locked",
    [SCHEDULE_STATUS.CANCELLED]: "Cancelled",
    [SCHEDULE_STATUS.EXPIRED]: "Expired"
  }

  return labels[status] || status
}

function formatMember(member) {
  const job = member.class_label || getClassOption(member.class_key)?.label || member.class_key
  const confirm = member.confirmation_response
    ? ` | Confirm: ${member.confirmation_response}`
    : ""

  return `- <@${member.user_id}> | ${job} | ${member.join_status}${confirm}`
}

function buildPartyEmbed(party) {
  const activeCount = Number(party.active_member_count || 0)
  const maxMembers = Number(party.max_members || 0)
  const memberLines = party.members?.length
    ? party.members.map(formatMember).join("\n")
    : "No members yet."

  return new EmbedBuilder()
    .setTitle(`Party: ${party.name}`)
    .setDescription(party.description || "Dragon Nest party recruitment")
    .setColor(0x2b8a3e)
    .addFields(
      {
        name: "Status",
        value: partyStatusLabel(party.status),
        inline: true
      },
      {
        name: "Members",
        value: `${activeCount}/${maxMembers}`,
        inline: true
      },
      {
        name: "Leader",
        value: `<@${party.leader_id}>`,
        inline: true
      },
      {
        name: "Roster",
        value: truncate(memberLines)
      }
    )
}

function buildPartyActionRows(party) {
  const isClosed = [PARTY_STATUS.CLOSED, PARTY_STATUS.CANCELLED, PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED]
    .includes(party.status)
  const joinDisabled = isClosed || party.status !== PARTY_STATUS.RECRUITING
  const confirmDisabled = party.status !== PARTY_STATUS.PENDING_CONFIRM

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`party:join:start:${party.id}`)
      .setLabel("Join Party")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(joinDisabled),
    new ButtonBuilder()
      .setCustomId(`party:confirm:${party.id}`)
      .setLabel("Confirm Party")
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`party:refresh:${party.id}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
  )

  return [actionRow]
}

function buildClassSelectRow(partyId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`party:class:${partyId}`)
    .setPlaceholder("Choose your Dragon Nest class")
    .addOptions(
      dragonNestClasses.slice(0, 25).map((job) => ({
        label: job.label,
        value: job.key
      }))
    )

  return new ActionRowBuilder().addComponents(menu)
}

function buildJoinConfirmRows(partyId, classKey) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`party:join:confirm:${partyId}:${classKey}`)
        .setLabel("Confirm Join")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`party:join:start:${partyId}`)
        .setLabel("Change Class")
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

function buildScheduleEmbed(event, party) {
  const acceptedMentions = event.votes
    .filter((vote) => vote.vote === SCHEDULE_VOTE.ACCEPT)
    .map((vote) => `<@${vote.user_id}>`)
    .join(", ") || "-"

  const deniedMentions = event.votes
    .filter((vote) => vote.vote === SCHEDULE_VOTE.DENY)
    .map((vote) => `<@${vote.user_id}>`)
    .join(", ") || "-"

  return new EmbedBuilder()
    .setTitle(`Schedule Vote: ${event.title}`)
    .setDescription(event.description || `Schedule vote for ${party.name}`)
    .setColor(
      event.status === SCHEDULE_STATUS.LOCKED
        ? 0x1c7ed6
        : event.status === SCHEDULE_STATUS.CANCELLED
          ? 0xe03131
          : 0xf08c00
    )
    .addFields(
      {
        name: "Party",
        value: party ? `${party.name}` : `#${event.party_id}`,
        inline: true
      },
      {
        name: "Status",
        value: scheduleStatusLabel(event.status),
        inline: true
      },
      {
        name: "Time",
        value: `${event.proposed_start_at}${event.proposed_end_at ? ` -> ${event.proposed_end_at}` : ""}`,
        inline: false
      },
      {
        name: "Accepted",
        value: truncate(acceptedMentions),
        inline: false
      },
      {
        name: "Denied",
        value: truncate(deniedMentions),
        inline: false
      }
    )
    .setFooter({
      text: `Schedule #${event.id} • Timezone: ${event.timezone || "Asia/Bangkok"}`
    })
}

function buildScheduleBoardEmbed(event, party) {
  const activeMembers = party.members
    .filter((member) => ["joined", "confirmed"].includes(member.join_status))
    .map((member) => {
      const job = member.class_label || getClassOption(member.class_key)?.label || member.class_key
      return `- ${job} • <@${member.user_id}>`
    })
    .join("\n")

  const roleMention = party.party_role_id ? `<@&${party.party_role_id}>` : party.name
  const partyRoom = party.party_channel_id ? `<#${party.party_channel_id}>` : "Not created yet"
  const scheduleWindow = event.proposed_end_at
    ? `${event.proposed_start_at} -> ${event.proposed_end_at}`
    : event.proposed_start_at
  const voteJumpUrl = event.vote_message_id && event.source_channel_id
    ? `https://discord.com/channels/${party.guild_id}/${event.source_channel_id}/${event.vote_message_id}`
    : null

  const embed = new EmbedBuilder()
    .setTitle(`Locked Schedule • ${party.name}`)
    .setDescription(event.description || "Confirmed party schedule")
    .setColor(0x1971c2)
    .addFields(
      {
        name: "Party",
        value: roleMention,
        inline: true
      },
      {
        name: "Leader",
        value: `<@${party.leader_id}>`,
        inline: true
      },
      {
        name: "Party Room",
        value: partyRoom,
        inline: true
      },
      {
        name: "Schedule",
        value: scheduleWindow,
        inline: false
      },
      {
        name: "Roster",
        value: truncate(activeMembers),
        inline: false
      }
    )
    .setFooter({
      text: `Schedule #${event.id} • Locked • ${event.timezone || "Asia/Bangkok"}`
    })

  if (voteJumpUrl) {
    embed.addFields({
      name: "Vote Post",
      value: `[Jump to original vote](${voteJumpUrl})`,
      inline: false
    })
  }

  return embed
}

function buildScheduleActionRows(event) {
  const disabled = event.status !== SCHEDULE_STATUS.VOTING

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule:vote:${event.id}:${SCHEDULE_VOTE.ACCEPT}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`schedule:vote:${event.id}:${SCHEDULE_VOTE.DENY}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ]
}

function buildPartyConfirmationNotice(party) {
  const mentions = party.members
    .filter((member) => ["joined", "confirmed"].includes(member.join_status))
    .map((member) => `<@${member.user_id}>`)
    .join(" ")

  return `${mentions}\nParty is full. Everyone please click "Confirm Party" on the recruitment post.`
}

function buildPartyActivationNotice(party) {
  const roleMention = party.party_role_id ? `<@&${party.party_role_id}>` : party.name
  const channelMention = party.party_channel_id ? `<#${party.party_channel_id}>` : "private party channel"

  return `${roleMention} is now active. Your party room is ready at ${channelMention}.`
}

function buildScheduleLockedNotice(event) {
  const boardMention = event.board_channel_id ? `<#${event.board_channel_id}>` : "the schedule board"
  return `Schedule locked for ${event.proposed_start_at}. A summary has been posted to ${boardMention}.`
}

function buildScheduleCancelledNotice(event) {
  return `Schedule vote cancelled. Reason: ${event.cancelled_reason || "A member denied the proposed time."}`
}

module.exports = {
  buildClassSelectRow,
  buildJoinConfirmRows,
  buildPartyActionRows,
  buildPartyActivationNotice,
  buildPartyConfirmationNotice,
  buildPartyEmbed,
  buildScheduleActionRows,
  buildScheduleBoardEmbed,
  buildScheduleCancelledNotice,
  buildScheduleEmbed,
  buildScheduleLockedNotice,
  getClassOption
}
