function formatValue(value) {
  if (value === null || value === undefined) {
    return "null"
  }

  const text = String(value)

  if (!text || /\s/.test(text)) {
    return JSON.stringify(text)
  }

  return text
}

function formatOption(option) {
  if (!option) {
    return null
  }

  if (Array.isArray(option.options) && option.options.length) {
    return [option.name, ...option.options.map(formatOption).filter(Boolean)].join(" ")
  }

  return `${option.name}:${formatValue(option.value)}`
}

function formatCommandInteraction(interaction) {
  const parts = [`/${interaction.commandName}`]

  for (const option of interaction.options?.data || []) {
    const formatted = formatOption(option)
    if (formatted) {
      parts.push(formatted)
    }
  }

  return parts.join(" ")
}

function formatUser(user) {
  if (!user) {
    return "unknown-user"
  }

  const tag = user.tag || user.username || "unknown-user"
  return `${tag} (${user.id})`
}

function formatLocation(interaction) {
  const parts = []

  if (interaction?.guildId) {
    parts.push(`guild:${interaction.guildId}`)
  }

  if (interaction?.channelId) {
    parts.push(`channel:${interaction.channelId}`)
  }

  return parts.length ? ` ${parts.join(" ")}` : ""
}

function formatError(error) {
  if (!error) {
    return "unknown error"
  }

  const code = error.code ? ` code:${error.code}` : ""
  return `${error.message || String(error)}${code}`
}

function logCommandInteraction(interaction, status, details) {
  const command = formatCommandInteraction(interaction)
  const suffix = details ? ` ${details}` : ""
  console.log(`logsai ${status} ${command} by ${formatUser(interaction.user)}${formatLocation(interaction)}${suffix}`)
}

function formatComponentInteraction(interaction) {
  const parts = [interaction.customId || "unknown-component"]

  if (Array.isArray(interaction.values) && interaction.values.length) {
    parts.push(`values:${interaction.values.map(formatValue).join(",")}`)
  }

  return parts.join(" ")
}

function logComponentInteraction(interaction, status, details) {
  const component = formatComponentInteraction(interaction)
  const suffix = details ? ` ${details}` : ""
  console.log(`logsai ${status} component ${component} by ${formatUser(interaction.user)}${formatLocation(interaction)}${suffix}`)
}

module.exports = {
  formatCommandInteraction,
  logCommandInteraction,
  logComponentInteraction,
  formatError
}
