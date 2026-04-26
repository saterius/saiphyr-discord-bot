const { getPartyAdminRoleConfig } = require("../services/guildConfigService")

function hasRole(member, roleId) {
  if (!member || !roleId) {
    return false
  }

  if (member.roles?.cache?.has) {
    return member.roles.cache.has(roleId)
  }

  if (Array.isArray(member.roles)) {
    return member.roles.includes(roleId)
  }

  return false
}

async function memberHasPartyAdminRole(interaction) {
  if (!interaction?.guildId || !interaction?.user?.id) {
    return false
  }

  const config = await getPartyAdminRoleConfig(interaction.guildId).catch((error) => {
    if (String(error?.message || "").includes("guild_party_admin_role_configs")) {
      return null
    }

    throw error
  })
  const adminRoleId = config?.admin_role_id

  if (!adminRoleId) {
    return false
  }

  if (hasRole(interaction.member, adminRoleId)) {
    return true
  }

  const guildMember = await interaction.guild?.members
    ?.fetch(interaction.user.id)
    .catch(() => null)

  return hasRole(guildMember, adminRoleId)
}

module.exports = {
  memberHasPartyAdminRole
}
