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
  reason = "ปาร์ตี้เสร็จสิ้นแล้ว",
  allowNonLeader = false
}) {
  if (!guild) {
    throw new ServiceError("ไม่พบข้อมูลเซิร์ฟเวอร์", "VALIDATION_ERROR")
  }

  const party = await partyService.getPartyById(partyId)

  if (["closed", "cancelled"].includes(party.status)) {
    throw new ServiceError(
      "ปาร์ตี้นี้ถูกปิดไปแล้ว",
      "PARTY_ALREADY_FINISHED",
      { partyId, status: party.status }
    )
  }

  if (party.guild_id !== guild.id) {
    throw new ServiceError(
      "ปาร์ตี้นี้ไม่ได้อยู่ในเซิร์ฟเวอร์นี้",
      "PARTY_GUILD_MISMATCH",
      { partyId, guildId: guild.id }
    )
  }

  const closedParty = await partyService.updatePartyStatus({
    partyId,
    actorId,
    status: "closed",
    reason,
    allowNonLeader
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
