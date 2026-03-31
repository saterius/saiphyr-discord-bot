const PARTY_STATUS = Object.freeze({
  RECRUITING: "recruiting",
  PENDING_CONFIRM: "pending_confirm",
  ACTIVE: "active",
  SCHEDULED: "scheduled",
  CLOSED: "closed",
  CANCELLED: "cancelled"
})

const MEMBER_STATUS = Object.freeze({
  JOINED: "joined",
  CONFIRMED: "confirmed",
  KICKED: "kicked",
  LEFT: "left"
})

const CONFIRMATION_RESPONSE = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined"
})

const SCHEDULE_STATUS = Object.freeze({
  VOTING: "voting",
  LOCKED: "locked",
  CANCELLED: "cancelled",
  EXPIRED: "expired"
})

const SCHEDULE_VOTE = Object.freeze({
  ACCEPT: "accept",
  DENY: "deny"
})

module.exports = {
  CONFIRMATION_RESPONSE,
  MEMBER_STATUS,
  PARTY_STATUS,
  SCHEDULE_STATUS,
  SCHEDULE_VOTE
}
