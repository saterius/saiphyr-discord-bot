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
  PARTY_TYPE,
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

function getCurrentUnixSeconds() {
  return Math.floor(Date.now() / 1000)
}

function isScheduleStartDue(event, nowUnix = getCurrentUnixSeconds()) {
  const startAtUnix = Number(event?.start_at_unix)
  return Number.isFinite(startAtUnix) && startAtUnix <= nowUnix
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
        setm.start_at_unix,
        setm.end_at_unix,
        p.guild_id,
        p.name AS party_name,
        p.status AS party_status,
        p.party_type,
        p.leader_id,
        p.party_channel_id
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      LEFT JOIN schedule_event_times setm ON setm.event_id = se.id
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
  startAtUnix,
  endAtUnix = null,
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
  requireValue(startAtUnix, "startAtUnix is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyForScheduling(tx, partyId)

    if (![PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)) {
      throw new ServiceError(
        "Party must be active before creating a schedule vote.",
        "PARTY_NOT_ACTIVE",
        { partyId, status: party.status }
      )
    }

    if (party.party_type !== PARTY_TYPE.STATIC) {
      throw new ServiceError(
        "ปาร์ตี้เฉพาะกิจไม่สามารถใช้ /schedule create ได้",
        "SCHEDULE_NOT_ALLOWED_FOR_AD_HOC_PARTY",
        { partyId, partyType: party.party_type }
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

    const existingActiveEvent = await getOne(
      tx,
      `
        SELECT id, status
        FROM schedule_events
        WHERE party_id = ?
          AND status IN (?, ?)
        LIMIT 1
      `,
      [partyId, SCHEDULE_STATUS.VOTING, SCHEDULE_STATUS.LOCKED]
    )

    if (existingActiveEvent) {
      throw new ServiceError(
        "ปาร์ตี้นี้มีตารางที่กำลังใช้งานอยู่แล้ว กรุณายกเลิกหรือเคลียร์ของเดิมก่อน",
        "SCHEDULE_ALREADY_OPEN",
        {
          partyId,
          eventId: existingActiveEvent.id,
          status: existingActiveEvent.status
        }
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

    await run(
      tx,
      `
        INSERT INTO schedule_event_times (
          event_id,
          start_at_unix,
          end_at_unix
        )
        VALUES (?, ?, ?)
      `,
      [eventId, startAtUnix, endAtUnix]
    )

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

async function getLatestScheduleEventForParty(partyId) {
  requireValue(partyId, "partyId is required.")

  const event = await getOne(
    db,
    `
      SELECT id
      FROM schedule_events
      WHERE party_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [partyId]
  )

  if (!event) {
    return null
  }

  return loadScheduleEventDetails(db, event.id)
}

async function getVotingScheduleEventForParty(partyId) {
  requireValue(partyId, "partyId is required.")

  const event = await getOne(
    db,
    `
      SELECT id
      FROM schedule_events
      WHERE party_id = ?
        AND status = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [partyId, SCHEDULE_STATUS.VOTING]
  )

  if (!event) {
    return null
  }

  return loadScheduleEventDetails(db, event.id)
}

async function getLockedScheduleEventForParty(partyId) {
  requireValue(partyId, "partyId is required.")

  const event = await getOne(
    db,
    `
      SELECT id
      FROM schedule_events
      WHERE party_id = ?
        AND status = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [partyId, SCHEDULE_STATUS.LOCKED]
  )

  if (!event) {
    return null
  }

  return loadScheduleEventDetails(db, event.id)
}

async function getCancelableScheduleEventForParty(partyId) {
  requireValue(partyId, "partyId is required.")

  const event = await getOne(
    db,
    `
      SELECT id
      FROM schedule_events
      WHERE party_id = ?
        AND status IN (?, ?)
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [partyId, SCHEDULE_STATUS.VOTING, SCHEDULE_STATUS.LOCKED]
  )

  if (!event) {
    return null
  }

  return loadScheduleEventDetails(db, event.id)
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
        setm.start_at_unix,
        setm.end_at_unix,
        COUNT(CASE WHEN sv.vote = 'accept' THEN 1 END) AS accept_count,
        COUNT(CASE WHEN sv.vote = 'deny' THEN 1 END) AS deny_count
      FROM schedule_events se
      LEFT JOIN schedule_event_times setm ON setm.event_id = se.id
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
          note || "มีสมาชิกไม่สะดวกสำหรับช่วงเวลานั้น.",
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

    if (event.creator_id !== actorId && party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้หรือคนที่สร้างตารางนัดนี้เท่านั้นที่ยกเลิกได้",
        "NOT_SCHEDULE_MANAGER",
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

async function lockScheduleEvent({
  eventId,
  actorId,
  reason = "Locked manually."
}) {
  requireValue(eventId, "eventId is required.")
  requireValue(actorId, "actorId is required.")

  return withTransaction("write", async (tx) => {
    const event = await getScheduleEventRecord(tx, eventId)
    const party = await getPartyForScheduling(tx, event.party_id)

    if (party.leader_id !== actorId && event.creator_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้หรือคนที่สร้างตารางนัดนี้เท่านั้นที่ล็อกตารางได้",
        "NOT_SCHEDULE_MANAGER",
        { eventId, actorId }
      )
    }

    if (event.status === SCHEDULE_STATUS.LOCKED) {
      return loadScheduleEventDetails(tx, eventId)
    }

    if (event.status !== SCHEDULE_STATUS.VOTING) {
      throw new ServiceError(
        "ล็อกได้เฉพาะตารางที่กำลังโหวตอยู่เท่านั้น",
        "SCHEDULE_NOT_VOTING",
        { eventId, status: event.status }
      )
    }

    const lockedAt = now()

    await run(
      tx,
      `
        UPDATE schedule_events
        SET status = ?,
            locked_at = ?
        WHERE id = ?
      `,
      [SCHEDULE_STATUS.LOCKED, lockedAt, eventId]
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
      actorId,
      action: "schedule_locked_manually",
      scheduleEventId: eventId,
      meta: { reason, lockedAt }
    })

    return loadScheduleEventDetails(tx, eventId)
  })
}

async function completeScheduleEvent({
  eventId,
  actorId,
  reason = "Completed manually.",
  allowNonLeader = false
}) {
  requireValue(eventId, "eventId is required.")
  requireValue(actorId, "actorId is required.")

  return withTransaction("write", async (tx) => {
    const event = await getScheduleEventRecord(tx, eventId)
    const party = await getPartyForScheduling(tx, event.party_id)

    if (!allowNonLeader && party.leader_id !== actorId) {
      throw new ServiceError(
        "Only the party leader can complete a schedule event.",
        "NOT_PARTY_LEADER",
        { eventId, actorId }
      )
    }

    if (event.status === SCHEDULE_STATUS.EXPIRED) {
      return loadScheduleEventDetails(tx, eventId)
    }

    if (event.status !== SCHEDULE_STATUS.LOCKED) {
      throw new ServiceError(
        "Only locked schedules can be completed.",
        "SCHEDULE_NOT_LOCKED",
        { eventId, status: event.status }
      )
    }

    const nowUnix = getCurrentUnixSeconds()
    if (!isScheduleStartDue(event, nowUnix)) {
      throw new ServiceError(
        "ยังไม่ถึงเวลานัด จึงยังไม่สามารถกดเสร็จสิ้นตารางได้",
        "SCHEDULE_NOT_DUE",
        { eventId, startAtUnix: event.start_at_unix, nowUnix }
      )
    }

    const completedAt = now()

    await run(
      tx,
      `
        UPDATE schedule_events
        SET status = ?,
            cancelled_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [SCHEDULE_STATUS.EXPIRED, reason, eventId]
    )

    await run(
      tx,
      `
        UPDATE parties
        SET status = ?
        WHERE id = ?
          AND party_type = ?
          AND status = ?
      `,
      [PARTY_STATUS.ACTIVE, event.party_id, PARTY_TYPE.STATIC, PARTY_STATUS.SCHEDULED]
    )

    await run(
      tx,
      `
        UPDATE schedule_completion_prompts
        SET completed_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
      `,
      [completedAt, eventId]
    )

    await insertScheduleLog(tx, {
      partyId: event.party_id,
      actorId,
      action: "schedule_completed",
      scheduleEventId: eventId,
      meta: { reason, completedAt }
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

async function listScheduleEventsNeedingCompletionPrompt({
  nowUnix = Math.floor(Date.now() / 1000),
  delaySeconds = 60 * 60
} = {}) {
  const thresholdUnix = nowUnix - delaySeconds

  return getMany(
    db,
    `
      SELECT
        se.id,
        se.party_id,
        se.title,
        se.description,
        se.proposed_start_at,
        se.status,
        se.timezone,
        se.source_channel_id,
        se.vote_message_id,
        setm.start_at_unix,
        setm.end_at_unix,
        p.guild_id,
        p.name AS party_name,
        p.leader_id,
        p.party_role_id,
        p.party_channel_id,
        p.party_type
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      INNER JOIN schedule_event_times setm ON setm.event_id = se.id
      LEFT JOIN schedule_completion_prompts scp ON scp.event_id = se.id
      WHERE se.status = ?
        AND p.party_type = ?
        AND setm.start_at_unix IS NOT NULL
        AND setm.start_at_unix <= ?
        AND scp.event_id IS NULL
      ORDER BY setm.start_at_unix ASC, se.id ASC
    `,
    [SCHEDULE_STATUS.LOCKED, PARTY_TYPE.STATIC, thresholdUnix]
  )
}

async function listVotingScheduleEventsPastDue({
  nowUnix = Math.floor(Date.now() / 1000)
} = {}) {
  return getMany(
    db,
    `
      SELECT
        se.id,
        se.party_id,
        se.title,
        se.description,
        se.proposed_start_at,
        se.status,
        se.timezone,
        se.source_channel_id,
        se.vote_message_id,
        se.board_channel_id,
        se.board_message_id,
        setm.start_at_unix,
        setm.end_at_unix,
        p.guild_id,
        p.name AS party_name,
        p.leader_id,
        p.party_role_id,
        p.party_channel_id,
        p.party_type
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      INNER JOIN schedule_event_times setm ON setm.event_id = se.id
      WHERE se.status = ?
        AND setm.start_at_unix IS NOT NULL
        AND setm.start_at_unix <= ?
      ORDER BY setm.start_at_unix ASC, se.id ASC
    `,
    [SCHEDULE_STATUS.VOTING, nowUnix]
  )
}

async function listLockedScheduleEventsPastStart({
  nowUnix = Math.floor(Date.now() / 1000)
} = {}) {
  return getMany(
    db,
    `
      SELECT
        se.id,
        se.party_id,
        se.title,
        se.description,
        se.proposed_start_at,
        se.status,
        se.timezone,
        se.source_channel_id,
        se.vote_message_id,
        se.board_channel_id,
        se.board_message_id,
        setm.start_at_unix,
        setm.end_at_unix,
        p.guild_id,
        p.name AS party_name,
        p.leader_id,
        p.party_role_id,
        p.party_channel_id,
        p.party_type
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      INNER JOIN schedule_event_times setm ON setm.event_id = se.id
      WHERE se.status = ?
        AND setm.start_at_unix IS NOT NULL
        AND setm.start_at_unix <= ?
      ORDER BY setm.start_at_unix ASC, se.id ASC
    `,
    [SCHEDULE_STATUS.LOCKED, nowUnix]
  )
}

async function autoCancelScheduleEvent({
  eventId,
  reason = "Schedule expired before every member accepted."
}) {
  requireValue(eventId, "eventId is required.")

  return withTransaction("write", async (tx) => {
    const event = await getScheduleEventRecord(tx, eventId)

    if (event.status !== SCHEDULE_STATUS.VOTING) {
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
      actorId: "system",
      action: "schedule_auto_cancelled",
      scheduleEventId: eventId,
      meta: { reason, cancelledAt }
    })

    return loadScheduleEventDetails(tx, eventId)
  })
}

async function markScheduleCompletionPromptSent({
  eventId,
  promptChannelId = null,
  promptMessageId = null
}) {
  requireValue(eventId, "eventId is required.")

  await run(
    db,
    `
      INSERT INTO schedule_completion_prompts (
        event_id,
        prompt_channel_id,
        prompt_message_id
      )
      VALUES (?, ?, ?)
      ON CONFLICT (event_id)
      DO UPDATE SET
        prompt_channel_id = COALESCE(excluded.prompt_channel_id, schedule_completion_prompts.prompt_channel_id),
        prompt_message_id = COALESCE(excluded.prompt_message_id, schedule_completion_prompts.prompt_message_id),
        updated_at = CURRENT_TIMESTAMP
    `,
    [eventId, promptChannelId, promptMessageId]
  )
}

async function listGuildScheduleEntriesByStatuses(guildId, statuses) {
  requireValue(guildId, "guildId is required.")

  if (!Array.isArray(statuses) || !statuses.length) {
    throw new ServiceError("At least one schedule status is required.", "VALIDATION_ERROR")
  }

  const statusPlaceholders = statuses.map(() => "?").join(", ")

  return getMany(
    db,
    `
      SELECT
        se.id,
        se.party_id,
        se.title,
        se.description,
        se.proposed_start_at,
        se.proposed_end_at,
        se.status,
        se.timezone,
        se.source_channel_id,
        se.vote_message_id,
        setm.start_at_unix,
        setm.end_at_unix,
        p.guild_id,
        p.name AS party_name,
        p.leader_id,
        p.party_role_id,
        p.party_channel_id
      FROM schedule_events se
      INNER JOIN parties p ON p.id = se.party_id
      INNER JOIN schedule_event_times setm ON setm.event_id = se.id
      WHERE p.guild_id = ?
        AND p.party_type = ?
        AND se.status IN (${statusPlaceholders})
      ORDER BY
        CASE
          WHEN setm.start_at_unix IS NULL THEN 1
          ELSE 0
        END ASC,
        setm.start_at_unix ASC,
        se.proposed_start_at ASC,
        se.id ASC
    `,
    [guildId, PARTY_TYPE.STATIC, ...statuses]
  )
}

async function listGuildScheduleBoardEntries(guildId) {
  return listGuildScheduleEntriesByStatuses(guildId, [
    SCHEDULE_STATUS.VOTING,
    SCHEDULE_STATUS.LOCKED
  ])
}

async function listGuildScheduleBoardImageEntries(guildId) {
  return listGuildScheduleEntriesByStatuses(guildId, [
    SCHEDULE_STATUS.VOTING,
    SCHEDULE_STATUS.LOCKED,
    SCHEDULE_STATUS.EXPIRED
  ])
}

async function listGuildUnscheduledScheduleBoardParties(guildId, {
  rangeStartUnix,
  rangeEndUnix
} = {}) {
  requireValue(guildId, "guildId is required.")
  requireValue(rangeStartUnix, "rangeStartUnix is required.")
  requireValue(rangeEndUnix, "rangeEndUnix is required.")

  return getMany(
    db,
    `
      SELECT
        p.id,
        p.name
      FROM parties p
      WHERE p.guild_id = ?
        AND p.party_type = ?
        AND p.status = ?
        AND NOT EXISTS (
          SELECT 1
          FROM schedule_events se
          INNER JOIN schedule_event_times setm ON setm.event_id = se.id
          WHERE se.party_id = p.id
            AND se.status IN (?, ?, ?)
            AND setm.start_at_unix >= ?
            AND setm.start_at_unix < ?
        )
      ORDER BY p.id ASC
    `,
    [
      guildId,
      PARTY_TYPE.STATIC,
      PARTY_STATUS.ACTIVE,
      SCHEDULE_STATUS.VOTING,
      SCHEDULE_STATUS.LOCKED,
      SCHEDULE_STATUS.EXPIRED,
      rangeStartUnix,
      rangeEndUnix
    ]
  )
}

async function listGuildLockedScheduleEntries(guildId) {
  return listGuildScheduleEntriesByStatuses(guildId, [SCHEDULE_STATUS.LOCKED])
}

module.exports = {
  cancelScheduleEvent,
  completeScheduleEvent,
  createScheduleEvent,
  getCancelableScheduleEventForParty,
  getLockedScheduleEventForParty,
  getScheduleEventById,
  getLatestScheduleEventForParty,
  getVotingScheduleEventForParty,
  listGuildScheduleBoardEntries,
  listGuildScheduleBoardImageEntries,
  listGuildUnscheduledScheduleBoardParties,
  listGuildLockedScheduleEntries,
  listLockedScheduleEventsPastStart,
  listScheduleEventsNeedingCompletionPrompt,
  listVotingScheduleEventsPastDue,
  listPartyScheduleEvents,
  lockScheduleEvent,
  markScheduleCompletionPromptSent,
  autoCancelScheduleEvent,
  updateScheduleMessages,
  voteOnSchedule
}
