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

async function createPartyCalculation({
  partyId,
  creatorId,
  channelId,
  messageId,
  amountsText,
  grossTotal,
  stampCount,
  stampCost,
  netTotal,
  memberCount
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(creatorId, "creatorId is required.")
  requireValue(channelId, "channelId is required.")
  requireValue(messageId, "messageId is required.")
  requireValue(amountsText, "amountsText is required.")

  return withTransaction("write", async (tx) => {
    const result = await run(
      tx,
      `
        INSERT INTO party_calculations (
          party_id,
          creator_id,
          channel_id,
          message_id,
          amounts_text,
          gross_total,
          stamp_count,
          stamp_cost,
          net_total,
          member_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        partyId,
        creatorId,
        channelId,
        messageId,
        amountsText,
        grossTotal,
        stampCount,
        stampCost,
        netTotal,
        memberCount
      ]
    )

    return getPartyCalculationById(result.lastInsertRowid, tx)
  })
}

async function getPartyCalculationById(id, executor = db) {
  requireValue(id, "id is required.")

  return getOne(
    executor,
    `
      SELECT *
      FROM party_calculations
      WHERE id = ?
    `,
    [id]
  )
}

async function getPartyCalculationByMessageId(messageId) {
  requireValue(messageId, "messageId is required.")

  return getOne(
    db,
    `
      SELECT *
      FROM party_calculations
      WHERE message_id = ?
    `,
    [messageId]
  )
}

async function markSuggestionSent(id) {
  requireValue(id, "id is required.")

  return withTransaction("write", async (tx) => {
    await run(
      tx,
      `
        UPDATE party_calculations
        SET suggestion_sent = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [id]
    )

    return getPartyCalculationById(id, tx)
  })
}

module.exports = {
  createPartyCalculation,
  getPartyCalculationByMessageId,
  markSuggestionSent
}
