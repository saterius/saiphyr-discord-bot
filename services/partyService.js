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
const IMPORTED_CLASS_KEY = "unknown"
const IMPORTED_CLASS_LABEL = "ยังไม่ระบุ"

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
    throw new ServiceError("ไม่พบปาร์ตี้นี้", "PARTY_NOT_FOUND", { partyId })
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
    throw new ServiceError("ไม่พบปาร์ตี้นี้", "PARTY_NOT_FOUND", { partyId })
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

async function closeRecruitmentForConfirmation(executor, partyId) {
  const stats = await getPartyStats(executor, partyId)

  if (stats.activeMemberCount <= 0) {
    throw new ServiceError(
      "ปาร์ตี้ต้องมีอย่างน้อย 1 คนก่อนปิดรับสมัคร.",
      "PARTY_EMPTY",
      { partyId }
    )
  }

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
      "ปาร์ตี้นี้ถูกปิดไปแล้ว จึงไม่สามารถแก้ไขได้อีก",
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
  plannedEndAtUnix = null,
  plannedTimezone = null,
  recruitChannelId = null,
  recruitMessageId = null,
  maxMembers = 8,
  autoCloseAt = null
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(leaderId, "leaderId is required.")
  requireValue(name, "จำเป็นต้องระบุชื่อปาร์ตี้")

  if (!Number.isInteger(maxMembers) || maxMembers <= 0) {
    throw new ServiceError("จำนวนสมาชิกสูงสุดต้องเป็นตัวเลขจำนวนเต็มที่มากกว่า 0", "VALIDATION_ERROR")
  }

  if (!Object.values(PARTY_TYPE).includes(partyType)) {
    throw new ServiceError("ประเภทปาร์ตี้ไม่ถูกต้อง", "VALIDATION_ERROR", { partyType })
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
          planned_end_at_unix,
          planned_timezone,
          max_members,
          auto_close_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        plannedEndAtUnix,
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
      meta: { name, maxMembers, partyType, plannedStartAtUnix, plannedEndAtUnix, plannedTimezone }
    })

    return loadPartyDetails(tx, partyId)
  })
}

async function importParty({
  guildId,
  leaderId,
  actorId,
  name,
  description = null,
  partyType = PARTY_TYPE.AD_HOC,
  plannedStartAtUnix = null,
  plannedEndAtUnix = null,
  plannedTimezone = null,
  partyRoleId,
  partyChannelId,
  memberIds = [],
  maxMembers = 8
}) {
  requireValue(guildId, "guildId is required.")
  requireValue(leaderId, "leaderId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(name, "จำเป็นต้องระบุชื่อปาร์ตี้")
  requireValue(partyRoleId, "จำเป็นต้องระบุยศของปาร์ตี้")
  requireValue(partyChannelId, "จำเป็นต้องระบุห้องข้อความของปาร์ตี้")

  if (!Number.isInteger(maxMembers) || maxMembers <= 0) {
    throw new ServiceError("จำนวนสมาชิกสูงสุดต้องเป็นตัวเลขจำนวนเต็มที่มากกว่า 0", "VALIDATION_ERROR")
  }

  if (!Object.values(PARTY_TYPE).includes(partyType)) {
    throw new ServiceError("ประเภทปาร์ตี้ไม่ถูกต้อง", "VALIDATION_ERROR", { partyType })
  }

  return withTransaction("write", async (tx) => {
    const conflictingParty = await getOne(
      tx,
      `
        SELECT id, name
        FROM parties
        WHERE party_role_id = ?
           OR party_channel_id = ?
        LIMIT 1
      `,
      [partyRoleId, partyChannelId]
    )

    if (conflictingParty) {
      throw new ServiceError(
        `role หรือห้องนี้ถูกผูกกับปาร์ตี้ #${conflictingParty.id} (${conflictingParty.name}) อยู่แล้ว`,
        "PARTY_RESOURCE_ALREADY_LINKED",
        {
          conflictingPartyId: conflictingParty.id,
          partyRoleId,
          partyChannelId
        }
      )
    }

    const normalizedMemberIds = [...new Set(
      [leaderId, ...memberIds]
        .filter((memberId) => memberId !== undefined && memberId !== null && memberId !== "")
        .map((memberId) => String(memberId))
    )]

    if (!normalizedMemberIds.length) {
      throw new ServiceError("ต้องมีสมาชิกอย่างน้อย 1 คนสำหรับการนำเข้าปาร์ตี้", "VALIDATION_ERROR")
    }

    if (normalizedMemberIds.length > maxMembers) {
      throw new ServiceError(
        `จำนวนสมาชิกที่นำเข้า (${normalizedMemberIds.length}) มากกว่าจำนวนสมาชิกสูงสุด (${maxMembers})`,
        "PARTY_IMPORT_EXCEEDS_MAX_MEMBERS",
        { memberCount: normalizedMemberIds.length, maxMembers }
      )
    }

    const createdAt = now()

    const result = await run(
      tx,
      `
        INSERT INTO parties (
          guild_id,
          leader_id,
          party_role_id,
          party_channel_id,
          name,
          description,
          party_type,
          planned_start_at_unix,
          planned_end_at_unix,
          planned_timezone,
          max_members,
          status,
          locked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        guildId,
        leaderId,
        partyRoleId,
        partyChannelId,
        name,
        description,
        partyType,
        plannedStartAtUnix,
        plannedEndAtUnix,
        plannedTimezone,
        maxMembers,
        PARTY_STATUS.ACTIVE,
        createdAt
      ]
    )

    const partyId = result.lastInsertRowid

    for (const [index, memberId] of normalizedMemberIds.entries()) {
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
            joined_at,
            confirmed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          partyId,
          memberId,
          IMPORTED_CLASS_KEY,
          IMPORTED_CLASS_LABEL,
          index + 1,
          MEMBER_STATUS.CONFIRMED,
          createdAt,
          createdAt
        ]
      )
    }

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "party_imported",
      meta: {
        name,
        partyType,
        partyRoleId,
        partyChannelId,
        importedMemberCount: normalizedMemberIds.length
      }
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

async function listRecruitingParties({ includeMembers = false } = {}) {
  const parties = await getMany(
    db,
    `
      SELECT
        p.*,
        COUNT(CASE WHEN pm.join_status IN ('joined', 'confirmed') THEN 1 END) AS active_member_count,
        COUNT(CASE WHEN pm.join_status = 'confirmed' THEN 1 END) AS confirmed_member_count
      FROM parties p
      LEFT JOIN party_members pm ON pm.party_id = p.id
      WHERE p.status = ?
        AND p.recruit_channel_id IS NOT NULL
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `,
    [PARTY_STATUS.RECRUITING]
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

async function listOverdueAdHocPartiesForAutoCancellation(referenceUnix = Math.floor(Date.now() / 1000)) {
  return getMany(
    db,
    `
      SELECT
        id,
        guild_id,
        leader_id,
        status,
        party_type,
        recruit_channel_id,
        recruit_message_id,
        planned_start_at_unix
      FROM parties
      WHERE party_type = ?
        AND planned_start_at_unix IS NOT NULL
        AND planned_start_at_unix <= ?
        AND status IN (?, ?)
      ORDER BY planned_start_at_unix ASC, id ASC
    `,
    [
      PARTY_TYPE.AD_HOC,
      referenceUnix - (60 * 60),
      PARTY_STATUS.RECRUITING,
      PARTY_STATUS.PENDING_CONFIRM
    ]
  )
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
        "ปาร์ตี้นี้ยังไม่เปิดรับสมาชิกในตอนนี้",
        "PARTY_NOT_RECRUITING",
        { partyId, status: party.status }
      )
    }

    if (party.active_member_count >= party.max_members) {
      throw new ServiceError("ปาร์ตี้นี้เต็มแล้ว", "PARTY_FULL", { partyId })
    }

    const existingMember = await getPartyMember(tx, partyId, userId)
    const joinedAt = now()

    if (existingMember && ACTIVE_MEMBER_STATUSES.includes(existingMember.join_status)) {
      throw new ServiceError("คุณอยู่ในปาร์ตี้นี้อยู่แล้ว", "ALREADY_JOINED", { partyId, userId })
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
    throw new ServiceError("สถานะการยืนยันไม่ถูกต้อง", "VALIDATION_ERROR", { response })
  }

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.status !== PARTY_STATUS.PENDING_CONFIRM) {
      throw new ServiceError(
        "ปาร์ตี้นี้ไม่ได้อยู่ในสถานะรอการยืนยัน",
        "PARTY_NOT_PENDING_CONFIRM",
        { partyId, status: party.status }
      )
    }

    const member = await getPartyMember(tx, partyId, userId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "คุณไม่ได้เป็นสมาชิกของปาร์ตี้นี้",
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
      stats.activeMemberCount > 0 &&
      confirmations.acceptedCount === stats.activeMemberCount
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

async function activatePartyNow({
  partyId,
  actorId,
  reason = "activated_by_leader"
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่เปิดปาร์ตี้ได้ทันที",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (![PARTY_STATUS.RECRUITING, PARTY_STATUS.PENDING_CONFIRM].includes(party.status)) {
      throw new ServiceError(
        "ปาร์ตี้นี้ยังไม่อยู่ในสถานะที่เปิดใช้งานได้ทันที",
        "PARTY_NOT_READY_FOR_FORCE_ACTIVATION",
        { partyId, status: party.status }
      )
    }

    const stats = await getPartyStats(tx, partyId)

    if (stats.activeMemberCount <= 0) {
      throw new ServiceError(
        "ปาร์ตี้ต้องมีสมาชิกอย่างน้อย 1 คนก่อนเปิดใช้งานทันที",
        "PARTY_EMPTY",
        { partyId }
      )
    }

    const activatedAt = now()

    await run(
      tx,
      `
        UPDATE party_members
        SET join_status = ?,
            confirmed_at = COALESCE(confirmed_at, ?)
        WHERE party_id = ?
          AND join_status IN (?, ?)
      `,
      [MEMBER_STATUS.CONFIRMED, activatedAt, partyId, MEMBER_STATUS.JOINED, MEMBER_STATUS.CONFIRMED]
    )

    await run(
      tx,
      `
        DELETE FROM party_confirmations
        WHERE party_id = ?
      `,
      [partyId]
    )

    await run(
      tx,
      `
        UPDATE parties
        SET status = ?,
            locked_at = ?
        WHERE id = ?
      `,
      [PARTY_STATUS.ACTIVE, activatedAt, partyId]
    )

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "party_force_activated",
      meta: {
        activatedAt,
        reason,
        previousStatus: party.status,
        activeMemberCount: stats.activeMemberCount
      }
    })

    return loadPartyDetails(tx, partyId)
  })
}

async function closePartyRecruitment({
  partyId,
  actorId
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่จะปิดรับสมัครสมาชิกก่อนได้.",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (party.status !== PARTY_STATUS.RECRUITING) {
      throw new ServiceError(
        "การรับสมัครสมาชิกปาร์ตี้สามารถปิดได้เมื่ออยู่ในสถานะกำลังหาคนอยู่เท่านั้น.",
        "PARTY_NOT_RECRUITING",
        { partyId, status: party.status }
      )
    }

    const nextStatus = await closeRecruitmentForConfirmation(tx, partyId)

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "recruitment_closed_early",
      meta: { nextStatus }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      nextStatus
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
        "หัวหน้าปาร์ตี้เท่านั้นที่นำสมาชิกออกได้",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (targetUserId === party.leader_id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้ไม่สามารถนำตัวเองออกได้",
        "LEADER_CANNOT_BE_KICKED",
        { partyId, actorId }
      )
    }

    const member = await getPartyMember(tx, partyId, targetUserId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "ผู้ใช้ที่เลือกไม่ได้เป็นสมาชิกที่ยังใช้งานอยู่ของปาร์ตี้นี้",
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
        "คุณไม่ได้เป็นสมาชิกของปาร์ตี้นี้",
        "MEMBER_NOT_FOUND",
        { partyId, userId }
      )
    }

    if (party.leader_id === userId) {
      throw new ServiceError(
        "ตอนนี้ยังไม่มีระบบโอนหัวหน้าปาร์ตี้ ดังนั้นหัวหน้าปาร์ตี้ยังออกจากปาร์ตี้เองตรง ๆ ไม่ได้",
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

async function replacePartyMember({
  partyId,
  actorId,
  oldUserId,
  newUserId,
  classKey,
  classLabel = null,
  reason = "member_changed"
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(oldUserId, "oldUserId is required.")
  requireValue(newUserId, "newUserId is required.")
  requireValue(classKey, "classKey is required.")

  if (oldUserId === newUserId) {
    throw new ServiceError(
      "สมาชิกเดิมและสมาชิกใหม่ต้องเป็นคนละคนกัน",
      "SAME_MEMBER_CHANGE_TARGET",
      { partyId, oldUserId, newUserId }
    )
  }

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่เปลี่ยนสมาชิกได้",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (oldUserId === party.leader_id) {
      throw new ServiceError(
        "ยังไม่สามารถเปลี่ยนหัวหน้าปาร์ตี้ด้วยคำสั่งนี้ได้",
        "LEADER_CANNOT_BE_REPLACED",
        { partyId, oldUserId }
      )
    }

    if (newUserId === party.leader_id) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้อยู่ในปาร์ตี้นี้อยู่แล้ว",
        "NEW_MEMBER_ALREADY_LEADER",
        { partyId, newUserId }
      )
    }

    const oldMember = await getPartyMember(tx, partyId, oldUserId)
    if (!oldMember || !ACTIVE_MEMBER_STATUSES.includes(oldMember.join_status)) {
      throw new ServiceError(
        "สมาชิกเดิมไม่ได้อยู่ในปาร์ตี้นี้",
        "MEMBER_NOT_FOUND",
        { partyId, oldUserId }
      )
    }

    const existingNewMember = await getPartyMember(tx, partyId, newUserId)
    if (existingNewMember && ACTIVE_MEMBER_STATUSES.includes(existingNewMember.join_status)) {
      throw new ServiceError(
        "สมาชิกใหม่อยู่ในปาร์ตี้นี้อยู่แล้ว",
        "ALREADY_JOINED",
        { partyId, newUserId }
      )
    }

    const changedAt = now()
    const nextJoinStatus = [PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)
      ? MEMBER_STATUS.CONFIRMED
      : MEMBER_STATUS.JOINED
    const nextConfirmedAt = nextJoinStatus === MEMBER_STATUS.CONFIRMED ? changedAt : null

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
      [MEMBER_STATUS.KICKED, changedAt, actorId, reason, partyId, oldUserId]
    )

    await run(
      tx,
      `
        DELETE FROM party_confirmations
        WHERE party_id = ?
          AND user_id = ?
      `,
      [partyId, oldUserId]
    )

    if (existingNewMember) {
      await run(
        tx,
        `
          UPDATE party_members
          SET class_key = ?,
              class_label = ?,
              slot_number = ?,
              join_status = ?,
              joined_at = ?,
              confirmed_at = ?,
              removed_at = NULL,
              removed_by = NULL,
              removal_reason = NULL
          WHERE id = ?
        `,
        [
          classKey,
          classLabel,
          oldMember.slot_number,
          nextJoinStatus,
          changedAt,
          nextConfirmedAt,
          existingNewMember.id
        ]
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
            joined_at,
            confirmed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          partyId,
          newUserId,
          classKey,
          classLabel,
          oldMember.slot_number,
          nextJoinStatus,
          changedAt,
          nextConfirmedAt
        ]
      )
    }

    let nextStatus = party.status
    if ([PARTY_STATUS.RECRUITING, PARTY_STATUS.PENDING_CONFIRM].includes(party.status)) {
      nextStatus = await syncPartyRosterState(tx, partyId)
    }

    if (nextStatus === PARTY_STATUS.PENDING_CONFIRM) {
      await run(
        tx,
        `
          INSERT INTO party_confirmations (party_id, user_id, response)
          VALUES (?, ?, ?)
          ON CONFLICT (party_id, user_id)
          DO UPDATE SET
            response = excluded.response,
            responded_at = NULL,
            note = NULL
        `,
        [partyId, newUserId, CONFIRMATION_RESPONSE.PENDING]
      )
    }

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "member_changed",
      targetUserId: newUserId,
      meta: {
        oldUserId,
        newUserId,
        previousClassKey: oldMember.class_key,
        previousClassLabel: oldMember.class_label,
        classKey,
        classLabel,
        slotNumber: oldMember.slot_number,
        previousStatus: party.status,
        nextStatus,
        reason
      }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      previousMember: oldMember,
      changedAt
    }
  })
}

async function addPartyMember({
  partyId,
  actorId,
  userId,
  classKey,
  classLabel = null,
  reason = "member_added_by_leader"
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(userId, "userId is required.")
  requireValue(classKey, "classKey is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่เพิ่มสมาชิกได้",
        "NOT_PARTY_LEADER",
        { partyId, actorId }
      )
    }

    if (![PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)) {
      throw new ServiceError(
        "คำสั่งเพิ่มสมาชิกใช้ได้หลังเปิดปาร์ตี้แล้วเท่านั้น",
        "PARTY_NOT_ACTIVE",
        { partyId, status: party.status }
      )
    }

    if (party.active_member_count >= party.max_members) {
      throw new ServiceError("ปาร์ตี้นี้เต็มแล้ว", "PARTY_FULL", { partyId })
    }

    const existingMember = await getPartyMember(tx, partyId, userId)
    if (existingMember && ACTIVE_MEMBER_STATUSES.includes(existingMember.join_status)) {
      throw new ServiceError(
        "สมาชิกนี้อยู่ในปาร์ตี้อยู่แล้ว",
        "ALREADY_JOINED",
        { partyId, userId }
      )
    }

    const joinedAt = now()

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
              confirmed_at = ?,
              removed_at = NULL,
              removed_by = NULL,
              removal_reason = NULL
          WHERE id = ?
        `,
        [
          classKey,
          classLabel,
          null,
          MEMBER_STATUS.CONFIRMED,
          joinedAt,
          joinedAt,
          existingMember.id
        ]
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
            joined_at,
            confirmed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          partyId,
          userId,
          classKey,
          classLabel,
          null,
          MEMBER_STATUS.CONFIRMED,
          joinedAt,
          joinedAt
        ]
      )
    }

    await insertPartyLog(tx, {
      partyId,
      actorId,
      action: "member_added",
      targetUserId: userId,
      meta: {
        classKey,
        classLabel,
        previousStatus: existingMember?.join_status || null,
        reason
      }
    })

    return {
      party: await loadPartyDetails(tx, partyId),
      addedAt: joinedAt
    }
  })
}

async function updatePartyMemberClass({
  partyId,
  userId,
  classKey,
  classLabel = null
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(userId, "userId is required.")
  requireValue(classKey, "classKey is required.")

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)
    ensurePartyOpenForRosterChanges(party)

    if (!OPEN_PARTY_STATUSES.includes(party.status)) {
      throw new ServiceError(
        "ปาร์ตี้นี้ยังไม่อยู่ในช่วงที่เปลี่ยนอาชีพได้",
        "PARTY_CLASS_CHANGE_NOT_ALLOWED",
        { partyId, status: party.status }
      )
    }

    const member = await getPartyMember(tx, partyId, userId)
    if (!member || !ACTIVE_MEMBER_STATUSES.includes(member.join_status)) {
      throw new ServiceError(
        "คุณไม่ได้เป็นสมาชิกที่กำลังใช้งานอยู่ของปาร์ตี้นี้",
        "MEMBER_NOT_FOUND",
        { partyId, userId }
      )
    }

    await run(
      tx,
      `
        UPDATE party_members
        SET class_key = ?,
            class_label = ?
        WHERE party_id = ?
          AND user_id = ?
      `,
      [classKey, classLabel, partyId, userId]
    )

    await insertPartyLog(tx, {
      partyId,
      actorId: userId,
      action: "member_class_updated",
      targetUserId: userId,
      meta: {
        previousClassKey: member.class_key,
        previousClassLabel: member.class_label,
        classKey,
        classLabel
      }
    })

    return loadPartyDetails(tx, partyId)
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

async function setPartyConfirmationPromptResources({
  partyId,
  promptChannelId,
  promptMessageId
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(promptChannelId, "promptChannelId is required.")
  requireValue(promptMessageId, "promptMessageId is required.")

  return withTransaction("write", async (tx) => {
    await getPartyRecord(tx, partyId)

    await run(
      tx,
      `
        UPDATE parties
        SET confirmation_prompt_channel_id = ?,
            confirmation_prompt_message_id = ?
        WHERE id = ?
      `,
      [promptChannelId, promptMessageId, partyId]
    )

    return loadPartyDetails(tx, partyId)
  })
}

async function clearPartyConfirmationPromptResources(partyId) {
  requireValue(partyId, "partyId is required.")

  return withTransaction("write", async (tx) => {
    await getPartyRecord(tx, partyId)

    await run(
      tx,
      `
        UPDATE parties
        SET confirmation_prompt_channel_id = NULL,
            confirmation_prompt_message_id = NULL
        WHERE id = ?
      `,
      [partyId]
    )

    return loadPartyDetails(tx, partyId)
  })
}

async function updatePartyStatus({
  partyId,
  actorId,
  status,
  reason = null,
  allowNonLeader = false
}) {
  requireValue(partyId, "partyId is required.")
  requireValue(actorId, "actorId is required.")
  requireValue(status, "status is required.")

  if (!Object.values(PARTY_STATUS).includes(status)) {
    throw new ServiceError("สถานะปาร์ตี้ไม่ถูกต้อง", "VALIDATION_ERROR", { status })
  }

  return withTransaction("write", async (tx) => {
    const party = await getPartyRecord(tx, partyId)

    if (!allowNonLeader && party.leader_id !== actorId) {
      throw new ServiceError(
        "หัวหน้าปาร์ตี้เท่านั้นที่เปลี่ยนสถานะปาร์ตี้ได้",
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
  closePartyRecruitment,
  createParty,
  getPartyByChannelId,
  getPartyById,
  getPartyByRecruitMessageId,
  importParty,
  joinParty,
  listOverdueAdHocPartiesForAutoCancellation,
  listRecruitingParties,
  kickPartyMember,
  leaveParty,
  listGuildParties,
  addPartyMember,
  replacePartyMember,
  respondPartyConfirmation,
  activatePartyNow,
  clearPartyConfirmationPromptResources,
  updatePartyMemberClass,
  updatePartyResources,
  setPartyConfirmationPromptResources,
  updatePartyStatus
}
