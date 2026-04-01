const {
  db,
  getMany,
  getOne,
  run,
  withTransaction
} = require("../db/helpers")
const ServiceError = require("./serviceError")
const {
  CONFIRMATION_RESPONSE,
  MEMBER_STATUS,
  PARTY_STATUS,
  PARTY_TYPE
} = require("./partyConstants")

const ACTIVE_MEMBER_STATUSES = [MEMBER_STATUS.JOINED, MEMBER_STATUS.CONFIRMED]
const OPEN_PARTY_STATUSES = [
  PARTY_STATUS.RECRUITING,
  PARTY_STATUS.PENDING_CONFIRM,
  PARTY_STATUS.ACTIVE,
  PARTY_STATUS.SCHEDULED
]

function now() {
  return new Date().toISOString()
}

function toJson(value) {
  return value ? JSON.stringify(value) : null
}

function requireValue(value, message, code = "VALIDATION_ERROR") {
  if (value === undefined || value === null || value === "") {
    throw new ServiceError(message, code)
  }
}

async function insertPartyLog(executor, {
  partyId,
  actorId,
  action,
  targetUserId = null,
  scheduleEventId = null,
  meta = null
}) {
  await run(
    executor,
    `
      INSERT INTO party_logs (
        party_id,
        actor_id,
        action,
        target_user_id,
        schedule_event_id,
        meta_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [partyId, actorId, action, targetUserId, scheduleEventId, toJson(meta)]
  )
}

async function getPartyStats(executor, partyId) {
  const stats = await getOne(
    executor,
    `
      SELECT
        p.id,
        p.max_members AS maxMembers,
        p.status,
        COUNT(CASE WHEN pm.join_status IN ('joined', 'confirmed') THEN 1 END) AS activeMemberCount,
        COUNT(CASE WHEN pm.join_status = 'confirmed' THEN 1 END) AS confirmedMemberCount
      FROM parties p
      LEFT JOIN party_members pm ON pm.party_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `,
    [partyId]
  )

  if (!stats) {
    throw new ServiceError("Party not found.", "PARTY_NOT_FOUND", { partyId })
  }

  return stats
}

async function getPartyRecord(executor, partyId) {
  const party = await getOne(
    executor,
    `
      SELECT
        p.*,
        COUNT(CASE WHEN pm.join_status IN ('joined', 'confirmed') THEN 1 END) AS active_member_count,
        COUNT(CASE WHEN pm.join_status = 'confirmed' THEN 1 END) AS confirmed_member_count,
        COUNT(CASE WHEN pc.response = 'pending' THEN 1 END) AS pending_confirmation_count,
        COUNT(CASE WHEN pc.response = 'accepted' THEN 1 END) AS accepted_confirmation_count,
        COUNT(CASE WHEN pc.response = 'declined' THEN 1 END) AS declined_confirmation_count
      FROM parties p
      LEFT JOIN party_members pm ON pm.party_id = p.id
      LEFT JOIN party_confirmations pc
        ON pc.party_id = p.id
       AND pc.user_id = pm.user_id
      WHERE p.id = ?
      GROUP BY p.id
    `,
    [partyId]
  )

  if (!party) {
    throw new ServiceError("Party not found.", "PARTY_NOT_FOUND", { partyId })
  }

  return party
}

async function getPartyMember(executor, partyId, userId) {
  return getOne(
    executor,
    `
      SELECT *
      FROM party_members
      WHERE party_id = ? AND user_id = ?
    `,
    [partyId, userId]
  )
}

async function getConflictingPartyMembership(executor, guildId, userId, excludedPartyId = null) {
  const args = [guildId, userId]
  let excludedSql = ""

  if (excludedPartyId) {
    excludedSql = "AND p.id <> ?"
    args.push(excludedPartyId)
  }

  return getOne(
    executor,
    `
      SELECT
        p.id,
        p.name,
        p.status,
        pm.join_status
      FROM party_members pm
      INNER JOIN parties p ON p.id = pm.party_id
      WHERE p.guild_id = ?
        AND pm.user_id = ?
        AND pm.join_status IN ('joined', 'confirmed')
        AND p.status IN ('recruiting', 'pending_confirm', 'active', 'scheduled')
        ${excludedSql}
      LIMIT 1
    `,
    args
  )
}

async function seedPendingConfirmations(executor, partyId) {
  await run(
    executor,
    `
      DELETE FROM party_confirmations
      WHERE party_id = ?
    `,
    [partyId]
  )

  await run(
    executor,
    `
      INSERT INTO party_confirmations (party_id, user_id, response)
      SELECT party_id, user_id, ?
      FROM party_members
      WHERE party_id = ?
        AND join_status IN ('joined', 'confirmed')
    `,
    [CONFIRMATION_RESPONSE.PENDING, partyId]
  )
}

async function resetRosterConfirmationState(executor, partyId) {
  await run(
    executor,
    `
      UPDATE party_members
      SET join_status = ?,
          confirmed_at = NULL
      WHERE party_id = ?
        AND join_status = ?
    `,
    [MEMBER_STATUS.JOINED, partyId, MEMBER_STATUS.CONFIRMED]
  )

  await run(
    executor,
    `
      DELETE FROM party_confirmations
      WHERE party_id = ?
    `,
    [partyId]
  )
}

async function syncPartyRosterState(executor, partyId) {
  const stats = await getPartyStats(executor, partyId)

  if (stats.activeMemberCount >= stats.maxMembers) {
    await seedPendingConfirmations(executor, partyId)
    await run(
      executor,
      `
        UPDATE parties
        SET status = ?,
            locked_at = NULL
        WHERE id = ?
      `,
      [PARTY_STATUS.PENDING_CONFIRM, partyId]
    )

    return PARTY_STATUS.PENDING_CONFIRM
  }

  await resetRosterConfirmationState(executor, partyId)
  await run(
    executor,
    `
      UPDATE parties
      SET status = ?,
          locked_at = NULL
      WHERE id = ?
    `,
    [PARTY_STATUS.RECRUITING, partyId]
  )

  return PARTY_STATUS.RECRUITING
}

async function loadPartyMembers(executor, partyId) {
  return getMany(
    executor,
    `
      SELECT
        pm.*,
        pc.response AS confirmation_response,
        pc.responded_at AS confirmation_responded_at,
        pc.note AS confirmation_note
      FROM party_members pm
      LEFT JOIN party_confirmations pc
        ON pc.party_id = pm.party_id
       AND pc.user_id = pm.user_id
      WHERE pm.party_id = ?
      ORDER BY
        CASE pm.join_status
          WHEN 'confirmed' THEN 0
          WHEN 'joined' THEN 1
          WHEN 'left' THEN 2
          WHEN 'kicked' THEN 3
          ELSE 4
        END,
        COALESCE(pm.slot_number, 999),
        pm.joined_at
    `,
    [partyId]
  )
}

async function loadPartyDetails(executor, partyId) {
  const party = await getPartyRecord(executor, partyId)
  const members = await loadPartyMembers(executor, partyId)

  return {
    ...party,
    members
  }
}

function ensurePartyOpenForRosterChanges(party) {
  if ([PARTY_STATUS.CLOSED, PARTY_STATUS.CANCELLED].includes(party.status)) {
    throw new ServiceError(
      "This party is already closed and can no longer be changed.",
      "PARTY_CLOSED",
      { partyId: party.id, status: party.status }
    )
  }
}

async function createParty({
  guildId,
  leaderId,
  name,
  description = null,
  partyType = PARTY_TYPE.AD_HOC,
  plannedStartAtUnix = null,
  plannedTimezone = null,
  recruitChannelId = null,
  recruitMessageId = null,
  maxMembers = 8,
  autoCloseAt = null
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(leaderId, "leaderId is required.")
  requireValue(name, "Party name is required.")

  if (!Number.isInteger(maxMembers) || maxMembers <= 0) {
    throw new ServiceError("maxMembers must be a positive integer.", "VALIDATION_ERROR")
  }

  if (!Object.values(PARTY_TYPE).includes(partyType)) {
    throw new ServiceError("Invalid party type.", "VALIDATION_ERROR", { partyType })
  }

  return withTransaction("write", async (tx) => {
    const result = await run(
      tx,
      `
        INSERT INTO parties (
          guild_id,
          leader_id,
          recruit_channel_id,
          recruit_message_id,
          name,
          description,
          party_type,
          planned_start_at_unix,
          planned_timezone,
          max_members,
          auto_close_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        guildId,
        leaderId,
        recruitChannelId,
        recruitMessageId,
        name,
        description,
        partyType,
        plannedStartAtUnix,
        plannedTimezone,
        maxMembers,
        autoCloseAt
      ]
    )

    const partyId = result.lastInsertRowid

    await insertPartyLog(tx, {
      partyId,
      actorId: leaderId,
      action: "party_created",
      meta: { name, maxMembers, partyType, plannedStartAtUnix, plannedTimezone }
    })

    return loadPartyDetails(tx, partyId)
  })
}

async function getPartyById(partyId) {
  return loadPartyDetails(db, partyId)
}

async function getPartyByRecruitMessageId(recruitMessageId) {
  requireValue(recruitMessageId, "recruitMessageId is required.")

  const party = await getOne(
    db,
    `
      SELECT id
      FROM parties
      WHERE recruit_message_id = ?
      LIMIT 1
    `,
    [recruitMessageId]
  )

  if (!party) {
    return null
  }

  return loadPartyDetails(db, party.id)
}

async function getPartyByChannelId(channelId) {
  requireValue(channelId, "channelId is required.")

  const party = await getOne(
    db,
    `
      SELECT id
      FROM parties
      WHERE party_channel_id = ?
      LIMIT 1
    `,
    [channelId]
  )

  if (!party) {
    return null
  }

  return loadPartyDetails(db, party.id)
}

async function listGuildParties(guildId, { statuses = [], includeMembers = false } = {}) {
  requireValue(guildId, "guildId is required.")

  const args = [guildId]
  let filter = ""

  if (statuses.length) {
    filter = `AND p.status IN (${statuses.map(() => "?").join(", ")})`
    args.push(...statuses)
  }

  const parties = await getMany(
    db,
    `
      SELECT
        p.*,
        COUNT(CASE WHEN pm.join_status IN ('joined', 'confirmed') THEN 1 END) AS active_member_count,
        COUNT(CASE WHEN pm.join_status = 'confirmed' THEN 1 END) AS confirmed_member_count
      FROM parties p
      LEFT JOIN party_members pm ON pm.party_id = p.id
      WHERE p.guild_id = ?
        ${filter}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `,
    args
  )

  if (!includeMembers || !parties.length) {
    return parties
  }

  const membersByPartyId = new Map()
  const allMembers = await getMany(
    db,
    `
      SELECT *
      FROM party_members
      WHERE party_id IN (${parties.map(() => "?").join(", ")})
      ORDER BY joined_at ASC
    `,
    parties.map((party) => party.id)
  )

  for (const member of allMembers) {
    const members = membersByPartyId.get(member.party_id) || []
    members.push(member)
    membersByPartyId.set(member.party_id, members)
  }

  return parties.map((party) => ({
    ...party,
    members: membersByPartyId.get(party.id) || []
  }))
}

async function joinParty({
  partyId,
  userId,
  classKey,
  classLabel = null,
  slotNumber = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(userId, "userId is required.")
  requireValue(classKey, "classKey is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.status !== PARTY_STATUS.RECRUITING) {
      throw new ServiceError(
        "Party is not accepting new members right now.",
        "PARTY_NOT_RECRUITING",
        { partyId, status: party.status }
      )
    }

    const conflictingMembership = await getConflictingPartyMembership(tx, party.guild_id, userId, partyId)
    if (conflictingMembership) {
      throw new ServiceError(
        "User is already in another active party in this guild.",
        "USER_ALREADY_IN_PARTY",
        { userId, conflictingPartyId: conflictingMembership.id }
      )
    }

    if (party.active_member_count >= party.max_members) {
      throw new ServiceError("Party is already full.", "PARTY_FULL", { partyId })
    }

    const existingMember = await getPartyMember(tx, partyId, userId)
    const joinedAt = now()

    if (existingMember && ACTIVE_MEMBER_STATUSES.includes(existingMember.join_status)) {
      throw new ServiceError("User is already in this party.", "ALREADY_JOINED", { partyId, userId })
    }

    if (existingMember) {
      await run(
        tx,
        `
          UPDATE party_members
          SET class_key = ?,
              class_label = ?,
              slot_number = ?,
              join_status = ?,
              joined_at = ?,
              confirmed_at = NULL,
              removed_at = NULL,
              removed_by = NULL,
              removal_reason = NULL
          WHERE id = ?
        `,
        [classKey, classLabel, slotNumber, MEMBER_STATUS.JOINED, joinedAt, existingMember.id]
      )
    } else {
      await run(
        tx,
        `
          INSERT INTO party_members (
            party_id,
            user_id,
            class_key,
            class_label,
            slot_number,
            join_status,
            joined_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [partyId, userId, classKey, classLabel, slotNumber, MEMBER_STATUS.JOINED, joinedAt]
      )
    }

    const nextStatus = await syncPartyRosterState(tx, partyId)

    await insertPartyLog(tx, {
      partyId,
      actorId: userId,
      action: "member_joined",
      targetUserId: userId,
      meta: { classKey, classLabel, slotNumber, nextStatus }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      becameFull: nextStatus === PARTY_STATUS.PENDING_CONFIRM
    }
  })
}

async function respondPartyConfirmation({
  partyId,
  userId,
  response,
  note = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(userId, "userId is required.")
  requireValue(response, "response is required.")

  if (!Object.values(CONFIRMATION_RESPONSE).includes(response)) {
    throw new ServiceError("Invalid confirmation response.", "VALIDATION_ERROR", { response })
  }

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.status !== PARTY_STATUS.PENDING_CONFIRM) {
      throw new ServiceError(
        "Party is not waiting for confirmations.",
        "PARTY_NOT_PENDING_CONFIRM",
        { partyId, status: party.status }
      )
    }

    const member = await getPartyMember(tx, partyId, userId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "User is not an active member of this party.",
        "MEMBER_NOT_FOUND",
        { partyId, userId }
      )
    }

    const respondedAt = now()

    await run(
      tx,
      `
        INSERT INTO party_confirmations (party_id, user_id, response, responded_at, note)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (party_id, user_id)
        DO UPDATE SET
          response = excluded.response,
          responded_at = excluded.responded_at,
          note = excluded.note
      `,
      [partyId, userId, response, respondedAt, note]
    )

    if (response === CONFIRMATION_RESPONSE.ACCEPTED) {
      await run(
        tx,
        `
          UPDATE party_members
          SET join_status = ?,
              confirmed_at = ?
          WHERE party_id = ?
            AND user_id = ?
        `,
        [MEMBER_STATUS.CONFIRMED, respondedAt, partyId, userId]
      )
    } else {
      await run(
        tx,
        `
          UPDATE party_members
          SET join_status = ?,
              confirmed_at = NULL
          WHERE party_id = ?
            AND user_id = ?
            AND join_status = ?
        `,
        [MEMBER_STATUS.JOINED, partyId, userId, MEMBER_STATUS.CONFIRMED]
      )
    }

    const stats = await getPartyStats(tx, partyId)
    const confirmations = await getOne(
      tx,
      `
        SELECT
          COUNT(CASE WHEN response = 'accepted' THEN 1 END) AS acceptedCount,
          COUNT(CASE WHEN response = 'pending' THEN 1 END) AS pendingCount,
          COUNT(CASE WHEN response = 'declined' THEN 1 END) AS declinedCount
        FROM party_confirmations
        WHERE party_id = ?
      `,
      [partyId]
    )

    let partyActivated = false

    if (
      response === CONFIRMATION_RESPONSE.ACCEPTED &&
      stats.activeMemberCount === stats.maxMembers &&
      confirmations.acceptedCount === stats.maxMembers
    ) {
      await run(
        tx,
        `
          UPDATE parties
          SET status = ?,
              locked_at = ?
          WHERE id = ?
        `,
        [PARTY_STATUS.ACTIVE, respondedAt, partyId]
      )

      await insertPartyLog(tx, {
        partyId,
        actorId: userId,
        action: "party_activated",
        meta: { activatedAt: respondedAt }
      })

      partyActivated = true
    } else {
      await insertPartyLog(tx, {
        partyId,
        actorId: userId,
        action: "party_confirmation_responded",
        targetUserId: userId,
        meta: { response, note }
      })
    }

    return {
      party: await loadPartyDetails(tx, partyId),
      partyActivated
    }
  })
}

async function kickPartyMember({
  partyId,
  actorId,
  targetUserId,
  reason = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(targetUserId, "targetUserId is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "Only the party leader can kick members.",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (targetUserId === party.leader_id) {
      throw new ServiceError(
        "The party leader cannot kick themselves.",
        "LEADER_CANNOT_BE_KICKED",
        { partyId, actorId }
      )
    }

    const member = await getPartyMember(tx, partyId, targetUserId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "Target user is not an active member of this party.",
        "MEMBER_NOT_FOUND",
        { partyId, targetUserId }
      )
    }

    const removedAt = now()

    await run(
      tx,
      `
        UPDATE party_members
        SET join_status = ?,
            confirmed_at = NULL,
            removed_at = ?,
            removed_by = ?,
            removal_reason = ?
        WHERE party_id = ?
          AND user_id = ?
      `,
      [MEMBER_STATUS.KICKED, removedAt, actorId, reason, partyId, targetUserId]
    )

    await run(
      tx,
      `
        DELETE FROM party_confirmations
        WHERE party_id = ?
          AND user_id = ?
      `,
      [partyId, targetUserId]
    )

    const nextStatus = await syncPartyRosterState(tx, partyId)

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "member_kicked",
      targetUserId,
      meta: { reason, nextStatus }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      reopenedRecruitment: nextStatus === PARTY_STATUS.RECRUITING
    }
  })
}

async function leaveParty({
  partyId,
  userId,
  reason = "left"
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(userId, "userId is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    const member = await getPartyMember(tx, partyId, userId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "User is not an active member of this party.",
        "MEMBER_NOT_FOUND",
        { partyId, userId }
      )
    }

    if (party.leader_id === userId) {
      throw new ServiceError(
        "Leader transfer is not implemented yet, so the leader cannot leave directly.",
        "LEADER_CANNOT_LEAVE",
        { partyId, userId }
      )
    }

    const removedAt = now()

    await run(
      tx,
      `
        UPDATE party_members
        SET join_status = ?,
            confirmed_at = NULL,
            removed_at = ?,
            removed_by = ?,
            removal_reason = ?
        WHERE party_id = ?
          AND user_id = ?
      `,
      [MEMBER_STATUS.LEFT, removedAt, userId, reason, partyId, userId]
    )

    await run(
      tx,
      `
        DELETE FROM party_confirmations
        WHERE party_id = ?
          AND user_id = ?
      `,
      [partyId, userId]
    )

    const nextStatus = await syncPartyRosterState(tx, partyId)

    await insertPartyLog(tx, {
      partyId,
      actorId: userId,
      action: "member_left",
      targetUserId: userId,
      meta: { reason, nextStatus }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      reopenedRecruitment: nextStatus === PARTY_STATUS.RECRUITING
    }
  })
}

async function updatePartyResources({
  partyId,
  partyRoleId = null,
  partyChannelId = null,
  recruitMessageId = null,
  recruitChannelId = null
}) {
  requireValue(partyId, "partyId is required.")

  return withTransaction("write", async (tx) => {
    await getPartyRecord(tx, partyId)

    await run(
      tx,
      `
        UPDATE parties
        SET party_role_id = COALESCE(?, party_role_id),
            party_channel_id = COALESCE(?, party_channel_id),
            recruit_message_id = COALESCE(?, recruit_message_id),
            recruit_channel_id = COALESCE(?, recruit_channel_id)
        WHERE id = ?
      `,
      [partyRoleId, partyChannelId, recruitMessageId, recruitChannelId, partyId]
    )

    return loadPartyDetails(tx, partyId)
  })
}

async function updatePartyStatus({
  partyId,
  actorId,
  status,
  reason = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(status, "status is required.")

  if (!Object.values(PARTY_STATUS).includes(status)) {
    throw new ServiceError("Invalid party status.", "VALIDATION_ERROR", { status })
  }

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "Only the party leader can update the party status.",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    const closedAt = [PARTY_STATUS.CLOSED, PARTY_STATUS.CANCELLED].includes(status)
      ? now()
      : null

    await run(
      tx,
      `
        UPDATE parties
        SET status = ?,
            closed_at = CASE
              WHEN ? IS NULL THEN closed_at
              ELSE ?
            END
        WHERE id = ?
      `,
      [status, closedAt, closedAt, partyId]
    )

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "party_status_updated",
      meta: { status, reason }
    })

    return loadPartyDetails(tx, partyId)
  })
}

module.exports = {
  createParty,
  getPartyByChannelId,
  getPartyById,
  getPartyByRecruitMessageId,
  joinParty,
  kickPartyMember,
  leaveParty,
  listGuildParties,
  respondPartyConfirmation,
  updatePartyResources,
  updatePartyStatus
}
