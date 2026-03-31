const {
  db,
  getMany,
  getOne,
  run,
  withTransaction
} = require("../db/helpers")
const ServiceError = require("./serviceError")
const {
  MEMBER_STATUS,
  PARTY_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_VOTE
} = require("./partyConstants")

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

async function getPartyForScheduling(executor, partyId) {
  const party = await getOne(
    executor,
    `
      SELECT *
      FROM parties
      WHERE id = ?
    `,
    [partyId]
  )

  if (!party) {
    throw new ServiceError("Party not found.", "PARTY_NOT_FOUND", { partyId })
  }

  return party
}

async function getActivePartyMember(executor, partyId, userId) {
  return getOne(
    executor,
    `
      SELECT *
      FROM party_members
      WHERE party_id = ?
        AND user_id = ?
        AND join_status IN ('joined', 'confirmed')
    `,
    [partyId, userId]
  )
}

async function getActivePartyMemberCount(executor, partyId) {
  const record = await getOne(
    executor,
    `
      SELECT COUNT(*) AS memberCount
      FROM party_members
      WHERE party_id = ?
        AND join_status IN ('joined', 'confirmed')
    `,
    [partyId]
  )

  return record?.memberCount || 0
}

async function insertScheduleLog(executor, {
  partyId,
  actorId,
  action,
  scheduleEventId,
  targetUserId = null,
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

async function getScheduleEventRecord(executor, eventId) {
  const event = await getOne(
    executor,
    `
      SELECT
        se.*,
        p.guild_id,
        p.name AS party_name,
        p.status AS party_status
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      WHERE se.id = ?
    `,
    [eventId]
  )

  if (!event) {
    throw new ServiceError("Schedule event not found.", "SCHEDULE_NOT_FOUND", { eventId })
  }

  return event
}

async function loadScheduleVotes(executor, eventId) {
  return getMany(
    executor,
    `
      SELECT *
      FROM schedule_votes
      WHERE event_id = ?
      ORDER BY voted_at ASC
    `,
    [eventId]
  )
}

async function loadScheduleEventDetails(executor, eventId) {
  const event = await getScheduleEventRecord(executor, eventId)
  const votes = await loadScheduleVotes(executor, eventId)
  const voteSummary = await getOne(
    executor,
    `
      SELECT
        COUNT(CASE WHEN vote = 'accept' THEN 1 END) AS accept_count,
        COUNT(CASE WHEN vote = 'deny' THEN 1 END) AS deny_count
      FROM schedule_votes
      WHERE event_id = ?
    `,
    [eventId]
  )

  return {
    ...event,
    votes,
    accept_count: voteSummary?.accept_count || 0,
    deny_count: voteSummary?.deny_count || 0
  }
}

async function createScheduleEvent({
  partyId,
  creatorId,
  title,
  description = null,
  proposedStartAt,
  proposedEndAt = null,
  timezone = "Asia/Bangkok",
  voteDeadlineAt = null,
  sourceChannelId = null,
  voteMessageId = null,
  boardChannelId = null,
  boardMessageId = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(creatorId, "creatorId is required.")
  requireValue(title, "title is required.")
  requireValue(proposedStartAt, "proposedStartAt is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyForScheduling(tx, partyId)

    if (![PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)) {
      throw new ServiceError(
        "Party must be active before creating a schedule vote.",
        "PARTY_NOT_ACTIVE",
        { partyId, status: party.status }
      )
    }

    const member = await getActivePartyMember(tx, partyId, creatorId)
    if (!member) {
      throw new ServiceError(
        "Only active party members can create schedule votes.",
        "NOT_PARTY_MEMBER",
        { partyId, creatorId }
      )
    }

    const existingVotingEvent = await getOne(
      tx,
      `
        SELECT id
        FROM schedule_events
        WHERE party_id = ?
          AND status = ?
        LIMIT 1
      `,
      [partyId, SCHEDULE_STATUS.VOTING]
    )

    if (existingVotingEvent) {
      throw new ServiceError(
        "This party already has an active schedule vote.",
        "SCHEDULE_ALREADY_OPEN",
        { partyId, eventId: existingVotingEvent.id }
      )
    }

    const result = await run(
      tx,
      `
        INSERT INTO schedule_events (
          party_id,
          creator_id,
          title,
          description,
          proposed_start_at,
          proposed_end_at,
          timezone,
          vote_deadline_at,
          source_channel_id,
          vote_message_id,
          board_channel_id,
          board_message_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        partyId,
        creatorId,
        title,
        description,
        proposedStartAt,
        proposedEndAt,
        timezone,
        voteDeadlineAt,
        sourceChannelId,
        voteMessageId,
        boardChannelId,
        boardMessageId
      ]
    )

    const eventId = result.lastInsertRowid

    await insertScheduleLog(tx, {
      partyId,
      actorId: creatorId,
      action: "schedule_created",
      scheduleEventId: eventId,
      meta: { title, proposedStartAt, proposedEndAt, timezone }
    })

    return loadScheduleEventDetails(tx, eventId)
  })
}

async function getScheduleEventById(eventId) {
  return loadScheduleEventDetails(db, eventId)
}

async function listPartyScheduleEvents(partyId, { statuses = [] } = {}) {
  requireValue(partyId, "partyId is required.")

  const args = [partyId]
  let filter = ""

  if (statuses.length) {
    filter = `AND se.status IN (${statuses.map(() => "?").join(", ")})`
    args.push(...statuses)
  }

  return getMany(
    db,
    `
      SELECT
        se.*,
        COUNT(CASE WHEN sv.vote = 'accept' THEN 1 END) AS accept_count,
        COUNT(CASE WHEN sv.vote = 'deny' THEN 1 END) AS deny_count
      FROM schedule_events se
      LEFT JOIN schedule_votes sv ON sv.event_id = se.id
      WHERE se.party_id = ?
        ${filter}
      GROUP BY se.id
      ORDER BY se.created_at DESC
    `,
    args
  )
}

async function voteOnSchedule({
  eventId,
  userId,
  vote,
  note = null
}) {
  requireValue(eventId, "eventId is required.")
  requireValue(userId, "userId is required.")
  requireValue(vote, "vote is required.")

  if (!Object.values(SCHEDULE_VOTE).includes(vote)) {
    throw new ServiceError("Invalid schedule vote.", "VALIDATION_ERROR", { vote })
  }

  return withTransaction("write", async (tx) => {
    const event = await getScheduleEventRecord(tx, eventId)

    if (event.status !== SCHEDULE_STATUS.VOTING) {
      throw new ServiceError(
        "This schedule vote is no longer open.",
        "SCHEDULE_NOT_VOTING",
        { eventId, status: event.status }
      )
    }

    const member = await getActivePartyMember(tx, event.party_id, userId)
    if (!member) {
      throw new ServiceError(
        "Only active party members can vote on this schedule.",
        "NOT_PARTY_MEMBER",
        { eventId, userId }
      )
    }

    const votedAt = now()

    await run(
      tx,
      `
        INSERT INTO schedule_votes (event_id, user_id, vote, voted_at, note)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (event_id, user_id)
        DO UPDATE SET
          vote = excluded.vote,
          voted_at = excluded.voted_at,
          note = excluded.note
      `,
      [eventId, userId, vote, votedAt, note]
    )

    const summary = await getOne(
      tx,
      `
        SELECT
          COUNT(CASE WHEN vote = 'accept' THEN 1 END) AS acceptCount,
          COUNT(CASE WHEN vote = 'deny' THEN 1 END) AS denyCount
        FROM schedule_votes
        WHERE event_id = ?
      `,
      [eventId]
    )

    const activeMemberCount = await getActivePartyMemberCount(tx, event.party_id)

    let locked = false
    let cancelled = false

    if (summary.denyCount > 0) {
      await run(
        tx,
        `
          UPDATE schedule_events
          SET status = ?,
              cancelled_at = ?,
              cancelled_reason = ?
          WHERE id = ?
        `,
        [
          SCHEDULE_STATUS.CANCELLED,
          votedAt,
          note || "A party member denied the proposed schedule.",
          eventId
        ]
      )

      await insertScheduleLog(tx, {
        partyId: event.party_id,
        actorId: userId,
        action: "schedule_cancelled_by_vote",
        scheduleEventId: eventId,
        targetUserId: userId,
        meta: { vote, note }
      })

      cancelled = true
    } else if (activeMemberCount > 0 && summary.acceptCount === activeMemberCount) {
      await run(
        tx,
        `
          UPDATE schedule_events
          SET status = ?,
              locked_at = ?
          WHERE id = ?
        `,
        [SCHEDULE_STATUS.LOCKED, votedAt, eventId]
      )

      await run(
        tx,
        `
          UPDATE parties
          SET status = ?
          WHERE id = ?
            AND status IN (?, ?)
        `,
        [PARTY_STATUS.SCHEDULED, event.party_id, PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED]
      )

      await insertScheduleLog(tx, {
        partyId: event.party_id,
        actorId: userId,
        action: "schedule_locked",
        scheduleEventId: eventId,
        meta: { lockedAt: votedAt }
      })

      locked = true
    } else {
      await insertScheduleLog(tx, {
        partyId: event.party_id,
        actorId: userId,
        action: "schedule_vote_cast",
        scheduleEventId: eventId,
        targetUserId: userId,
        meta: { vote, note }
      })
    }

    return {
      event: await loadScheduleEventDetails(tx, eventId),
      locked,
      cancelled
    }
  })
}

async function cancelScheduleEvent({
  eventId,
  actorId,
  reason = "Cancelled manually."
}) {
  requireValue(eventId, "eventId is required.")
  requireValue(actorId, "actorId is required.")

  return withTransaction("write", async (tx) => {
    const event = await getScheduleEventRecord(tx, eventId)
    const party = await getPartyForScheduling(tx, event.party_id)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "Only the party leader can cancel a schedule event.",
        "NOT_PARTY_LEADER",
        { eventId, actorId }
      )
    }

    if ([SCHEDULE_STATUS.CANCELLED, SCHEDULE_STATUS.EXPIRED].includes(event.status)) {
      return loadScheduleEventDetails(tx, eventId)
    }

    const cancelledAt = now()

    await run(
      tx,
      `
        UPDATE schedule_events
        SET status = ?,
            cancelled_at = ?,
            cancelled_reason = ?
        WHERE id = ?
      `,
      [SCHEDULE_STATUS.CANCELLED, cancelledAt, reason, eventId]
    )

    await insertScheduleLog(tx, {
      partyId: event.party_id,
      actorId,
      action: "schedule_cancelled",
      scheduleEventId: eventId,
      meta: { reason }
    })

    return loadScheduleEventDetails(tx, eventId)
  })
}

async function updateScheduleMessages({
  eventId,
  voteMessageId = null,
  boardChannelId = null,
  boardMessageId = null,
  sourceChannelId = null
}) {
  requireValue(eventId, "eventId is required.")

  return withTransaction("write", async (tx) => {
    await getScheduleEventRecord(tx, eventId)

    await run(
      tx,
      `
        UPDATE schedule_events
        SET vote_message_id = COALESCE(?, vote_message_id),
            board_channel_id = COALESCE(?, board_channel_id),
            board_message_id = COALESCE(?, board_message_id),
            source_channel_id = COALESCE(?, source_channel_id)
        WHERE id = ?
      `,
      [voteMessageId, boardChannelId, boardMessageId, sourceChannelId, eventId]
    )

    return loadScheduleEventDetails(tx, eventId)
  })
}

module.exports = {
  cancelScheduleEvent,
  createScheduleEvent,
  getScheduleEventById,
  listPartyScheduleEvents,
  updateScheduleMessages,
  voteOnSchedule
}
