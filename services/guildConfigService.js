const {
  db,
  getOne,
  run,
  withTransaction
} = require("../db/helpers")
const ServiceError = require("./serviceError")

function requireValue(value, message, code = "VALIDATION_ERROR") {
  if (value === undefined || value === null || value === "") {
    throw new ServiceError(message, code)
  }
}

async function getVoiceConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_voice_configs
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function getScheduleConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_schedule_configs
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function setVoiceLobby({
  guildId,
  lobbyChannelId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(lobbyChannelId, "lobbyChannelId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_voice_configs (guild_id, lobby_channel_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          lobby_channel_id = excluded.lobby_channel_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, lobbyChannelId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_voice_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function clearVoiceLobby(guildId) {
  requireValue(guildId, "guildId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        DELETE FROM guild_voice_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function setScheduleBoard({
  guildId,
  boardChannelId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(boardChannelId, "boardChannelId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_schedule_configs (guild_id, board_channel_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          board_channel_id = excluded.board_channel_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, boardChannelId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_schedule_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function clearScheduleBoard(guildId) {
  requireValue(guildId, "guildId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        DELETE FROM guild_schedule_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

module.exports = {
  clearScheduleBoard,
  clearVoiceLobby,
  getScheduleConfig,
  getVoiceConfig,
  setScheduleBoard,
  setVoiceLobby
}
