const ServiceError = require("./serviceError")
const partyService = require("./partyService")

async function safeDeleteChannel(guild, channelId, reason) {
  if (!channelId) {
    return false
  }

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)
  if (!channel) {
    return false
  }

  await channel.delete(reason).catch(() => null)
  return true
}

async function safeDeleteRole(guild, roleId, reason) {
  if (!roleId) {
    return false
  }

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null)
  if (!role) {
    return false
  }

  await role.delete(reason).catch(() => null)
  return true
}

async function finishParty({
  guild,
  partyId,
  actorId,
  reason = "Party finished"
}) {
  if (!guild) {
    throw new ServiceError("guild is required.", "VALIDATION_ERROR")
  }

  const party = await partyService.getPartyById(partyId)

  if (party.guild_id !== guild.id) {
    throw new ServiceError(
      "Party does not belong to this guild.",
      "PARTY_GUILD_MISMATCH",
      { partyId, guildId: guild.id }
    )
  }

  const closedParty = await partyService.updatePartyStatus({
    partyId,
    actorId,
    status: "closed",
    reason
  })

  const removedRole = await safeDeleteRole(guild, party.party_role_id, `Finishing party ${partyId}`)
  const removedChannel = await safeDeleteChannel(guild, party.party_channel_id, `Finishing party ${partyId}`)

  return {
    party: closedParty,
    deletedResources: true,
    removedRole,
    removedChannel
  }
}

module.exports = {
  finishParty
}
