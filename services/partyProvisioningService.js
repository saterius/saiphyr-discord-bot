const {
  ChannelType,
  PermissionFlagsBits
} = require("discord.js")

const ServiceError = require("./serviceError")
const { PARTY_STATUS } = require("./partyConstants")
const partyService = require("./partyService")
const { getPartyChannelConfig } = require("./guildConfigService")

function defaultRoleName(party) {
  return String(party.name || "").trim() || `party-${party.id}`
}

function defaultChannelName(party) {
  return String(party.name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    || `party-${party.id}`
}

function buildClearedChannelName(channelName) {
  const normalizedName = String(channelName || "").trim().toLowerCase() || "party"
  const suffix = "-cleared"

  if (normalizedName.endsWith(suffix)) {
    return normalizedName
  }

  const maxBaseLength = 100 - suffix.length
  const baseName = normalizedName.slice(0, maxBaseLength).replace(/-+$/g, "") || "party"
  return `${baseName}${suffix}`
}

function buildUnclearedChannelName(channelName) {
  const normalizedName = String(channelName || "").trim().toLowerCase() || "party"
  return normalizedName.replace(/-cleared$/i, "") || "party"
}

async function resolveRole(guild, party, roleName) {
  if (party.party_role_id) {
    const existingRole = guild.roles.cache.get(party.party_role_id)
    if (existingRole) {
      return existingRole
    }
  }

  return guild.roles.create({
    name: roleName || defaultRoleName(party),
    mentionable: true,
    reason: `Provisioning role for party ${party.id}`
  })
}

async function resolveTextChannel(guild, party, role, {
  channelName,
  parentId = null,
  topic = null
}) {
  if (party.party_channel_id) {
    const existingChannel = guild.channels.cache.get(party.party_channel_id)
    if (existingChannel) {
      return existingChannel
    }
  }

  return guild.channels.create({
    name: channelName || defaultChannelName(party),
    type: ChannelType.GuildText,
    parent: parentId,
    topic: topic || `Private party room for ${party.name}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: party.leader_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ],
    reason: `Provisioning channel for party ${party.id}`
  })
}

async function assignPartyRole(guild, party, role) {
  const activeMembers = party.members.filter((member) =>
    ["joined", "confirmed"].includes(member.join_status)
  )

  for (const member of activeMembers) {
    const guildMember = await guild.members.fetch(member.user_id).catch(() => null)
    if (!guildMember) {
      continue
    }

    if (!guildMember.roles.cache.has(role.id)) {
      await guildMember.roles.add(role, `Assigned for party ${party.id}`)
    }
  }
}

async function markPartyChannelCleared(guild, partyId) {
  if (!guild) {
    throw new ServiceError("guild is required.", "VALIDATION_ERROR")
  }

  const party = await partyService.getPartyById(partyId)

  if (!party.party_channel_id) {
    return null
  }

  const channel = guild.channels.cache.get(party.party_channel_id)
    || await guild.channels.fetch(party.party_channel_id).catch(() => null)

  if (!channel) {
    return null
  }

  const nextName = buildClearedChannelName(channel.name)

  if (channel.name === nextName) {
    return channel
  }

  await channel.setName(nextName, `Marking party ${party.id} as cleared`).catch(() => null)
  return channel
}

async function clearPartyChannelClearedMark(guild, partyId) {
  if (!guild) {
    throw new ServiceError("guild is required.", "VALIDATION_ERROR")
  }

  const party = await partyService.getPartyById(partyId)

  if (!party.party_channel_id) {
    return null
  }

  const channel = guild.channels.cache.get(party.party_channel_id)
    || await guild.channels.fetch(party.party_channel_id).catch(() => null)

  if (!channel) {
    return null
  }

  const nextName = buildUnclearedChannelName(channel.name)

  if (channel.name === nextName) {
    return null
  }

  await channel.setName(nextName, `Clearing cleared mark for party ${party.id}`).catch(() => null)
  return channel
}

async function provisionPartyResources(guild, partyId, options = {}) {
  if (!guild) {
    throw new ServiceError("guild is required.", "VALIDATION_ERROR")
  }

  const party = await partyService.getPartyById(partyId)

  if (![PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)) {
    throw new ServiceError(
      "Party must be active before provisioning Discord resources.",
      "PARTY_NOT_ACTIVE",
      { partyId, status: party.status }
    )
  }

  const partyChannelConfig = await getPartyChannelConfig(guild.id)
  const resolvedParentId = partyChannelConfig?.category_channel_id || options.parentId || null
  const role = await resolveRole(guild, party, options.roleName)
  const channel = await resolveTextChannel(guild, party, role, {
    ...options,
    parentId: resolvedParentId
  })

  await assignPartyRole(guild, party, role)

  const updatedParty = await partyService.updatePartyResources({
    partyId,
    partyRoleId: role.id,
    partyChannelId: channel.id
  })

  return {
    party: updatedParty,
    role,
    channel
  }
}

module.exports = {
  provisionPartyResources,
  markPartyChannelCleared,
  clearPartyChannelClearedMark
}
