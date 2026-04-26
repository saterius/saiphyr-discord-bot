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

async function getScheduleBoardState(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_schedule_board_state
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function getPartyChannelConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_party_channel_configs
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function getPartyFinderConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_party_finder_configs
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function getCalChannelConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_party_cal_configs
      WHERE guild_id = ?
    `,
    [guildId]
  )
}

async function getPartyAdminRoleConfig(guildId) {
  requireValue(guildId, "guildId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM guild_party_admin_role_configs
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

async function setPartyChannelCategory({
  guildId,
  categoryChannelId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(categoryChannelId, "categoryChannelId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_party_channel_configs (guild_id, category_channel_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          category_channel_id = excluded.category_channel_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, categoryChannelId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_party_channel_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function setPartyFinderChannel({
  guildId,
  finderChannelId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(finderChannelId, "finderChannelId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_party_finder_configs (guild_id, finder_channel_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          finder_channel_id = excluded.finder_channel_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, finderChannelId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_party_finder_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function setCalChannel({
  guildId,
  calChannelId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(calChannelId, "calChannelId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_party_cal_configs (guild_id, cal_channel_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          cal_channel_id = excluded.cal_channel_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, calChannelId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_party_cal_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function setPartyAdminRole({
  guildId,
  adminRoleId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(adminRoleId, "adminRoleId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_party_admin_role_configs (guild_id, admin_role_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          admin_role_id = excluded.admin_role_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, adminRoleId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_party_admin_role_configs
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

async function setScheduleBoardMessage({
  guildId,
  boardMessageId
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(boardMessageId, "boardMessageId is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        INSERT INTO guild_schedule_board_state (guild_id, board_message_id)
        VALUES (?, ?)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          board_message_id = excluded.board_message_id,
          updated_at = CURRENT_TIMESTAMP
      `,
      [guildId, boardMessageId]
    )

    return getOne(
      tx,
      `
        SELECT *
        FROM guild_schedule_board_state
        WHERE guild_id = ?
      `,
      [guildId]
    )
  })
}

module.exports = {
  clearScheduleBoard,
  clearVoiceLobby,
  getCalChannelConfig,
  getPartyChannelConfig,
  getPartyFinderConfig,
  getPartyAdminRoleConfig,
  getScheduleBoardState,
  getScheduleConfig,
  getVoiceConfig,
  setCalChannel,
  setPartyAdminRole,
  setPartyChannelCategory,
  setPartyFinderChannel,
  setScheduleBoardMessage,
  setScheduleBoard,
  setVoiceLobby
}
