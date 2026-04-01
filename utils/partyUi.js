const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js")

const dragonNestClasses = require("../data/dragonNestClasses")
const {
  PARTY_STATUS,
  PARTY_TYPE,
  SCHEDULE_STATUS,
  SCHEDULE_VOTE
} = require("../services/partyConstants")

function getClassOption(classKey) {
  return dragonNestClasses.find((job) => job.key === classKey) || null
}

function truncate(value, maxLength = 1024) {
  if (!value) {
    return "-"
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function renderDiscordTimestamp(unix, style = "F") {
  if (!unix) {
    return "-"
  }

  return `<t:${unix}:${style}>`
}

function renderScheduleWindow(event) {
  if (event.start_at_unix) {
    const startFull = renderDiscordTimestamp(event.start_at_unix, "F")
    const startRelative = renderDiscordTimestamp(event.start_at_unix, "R")

    return `${startFull}\n${startRelative}`
  }

  return event.proposed_start_at || "-"
}

function renderPartyPlannedTime(party) {
  if (!party.planned_start_at_unix) {
    return "-"
  }

  return `${renderDiscordTimestamp(party.planned_start_at_unix, "F")}\n${renderDiscordTimestamp(party.planned_start_at_unix, "R")}`
}

function partyStatusLabel(status) {
  const labels = {
    [PARTY_STATUS.RECRUITING]: "กำลังรับคน",
    [PARTY_STATUS.PENDING_CONFIRM]: "รอยืนยัน",
    [PARTY_STATUS.ACTIVE]: "พร้อมลุย",
    [PARTY_STATUS.SCHEDULED]: "นัดแล้ว",
    [PARTY_STATUS.CLOSED]: "ปิดแล้ว",
    [PARTY_STATUS.CANCELLED]: "ยกเลิกแล้ว"
  }

  return labels[status] || status
}

function partyStatusMeta(status) {
  const meta = {
    [PARTY_STATUS.RECRUITING]: {
      emoji: "🟢",
      color: 0x2f9e44,
      titlePrefix: "กำลังหา",
      highlight: "กำลังเปิดรับสมาชิก"
    },
    [PARTY_STATUS.PENDING_CONFIRM]: {
      emoji: "🟡",
      color: 0xf08c00,
      titlePrefix: "รอยืนยัน",
      highlight: "สมาชิกครบหรือปิดรับแล้ว รอทุกคนกดยืนยัน"
    },
    [PARTY_STATUS.ACTIVE]: {
      emoji: "🔵",
      color: 0x1c7ed6,
      titlePrefix: "พร้อมลุย",
      highlight: "ปาร์ตี้พร้อมใช้งานแล้ว"
    },
    [PARTY_STATUS.SCHEDULED]: {
      emoji: "🗓️",
      color: 0x1971c2,
      titlePrefix: "นัดแล้ว",
      highlight: "ปาร์ตี้นี้มีเวลานัดเรียบร้อยแล้ว"
    },
    [PARTY_STATUS.CLOSED]: {
      emoji: "⚫",
      color: 0x495057,
      titlePrefix: "ปิดแล้ว",
      highlight: "ปาร์ตี้นี้ปิดแล้ว"
    },
    [PARTY_STATUS.CANCELLED]: {
      emoji: "🔴",
      color: 0xe03131,
      titlePrefix: "ยกเลิก",
      highlight: "ปาร์ตี้นี้ถูกยกเลิกแล้ว"
    }
  }

  return meta[status] || {
    emoji: "📌",
    color: 0x495057,
    titlePrefix: "ปาร์ตี้",
    highlight: partyStatusLabel(status)
  }
}

function scheduleStatusLabel(status) {
  const labels = {
    [SCHEDULE_STATUS.VOTING]: "กำลังโหวต",
    [SCHEDULE_STATUS.LOCKED]: "ล็อกแล้ว",
    [SCHEDULE_STATUS.CANCELLED]: "ยกเลิกแล้ว",
    [SCHEDULE_STATUS.EXPIRED]: "หมดเวลา"
  }

  return labels[status] || status
}

function partyTypeLabel(type) {
  const labels = {
    [PARTY_TYPE.STATIC]: "ประจำ",
    [PARTY_TYPE.AD_HOC]: "เฉพาะกิจ"
  }

  return labels[type] || type || "-"
}

function formatMember(member) {
  const job = member.class_label || getClassOption(member.class_key)?.label || member.class_key
  const confirm = member.confirmation_response
    ? ` | ยืนยัน: ${member.confirmation_response}`
    : ""

  return `- <@${member.user_id}> | ${job} | ${member.join_status}${confirm}`
}

function buildPartyEmbed(party) {
  const activeCount = Number(party.active_member_count || 0)
  const maxMembers = Number(party.max_members || 0)
  const memberLines = party.members?.length
    ? party.members.map(formatMember).join("\n")
    : "ยังไม่มีสมาชิก"
  const statusMeta = partyStatusMeta(party.status)
  const fields = [
    {
      name: "สถานะ",
      value: `${statusMeta.emoji} ${partyStatusLabel(party.status)}`,
      inline: true
    },
    {
      name: "สมาชิก",
      value: `${activeCount}/${maxMembers}`,
      inline: true
    },
    {
      name: "หัวหน้าปาร์ตี้",
      value: `<@${party.leader_id}>`,
      inline: true
    },
    {
      name: "ประเภท",
      value: partyTypeLabel(party.party_type),
      inline: true
    }
  ]

  if (party.party_type === PARTY_TYPE.AD_HOC && party.planned_start_at_unix) {
    fields.push({
      name: "เวลานัด",
      value: renderPartyPlannedTime(party),
      inline: false
    })
  }

  fields.push({
    name: "รายชื่อ",
    value: truncate(memberLines)
  })

  return new EmbedBuilder()
    .setTitle(`${statusMeta.emoji} ${statusMeta.titlePrefix}: ${party.name}`)
    .setDescription([
      `**${statusMeta.highlight}**`,
      party.description || "กำลังรับสมัครสมาชิกปาร์ตี้"
    ].filter(Boolean).join("\n"))
    .setColor(statusMeta.color)
    .addFields(fields)
}

function buildPartyActionRows(party) {
  const isClosed = [PARTY_STATUS.CLOSED, PARTY_STATUS.CANCELLED, PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED]
    .includes(party.status)
  const joinDisabled = isClosed || party.status !== PARTY_STATUS.RECRUITING
  const confirmDisabled = party.status !== PARTY_STATUS.PENDING_CONFIRM
  const closeRecruitmentDisabled = party.status !== PARTY_STATUS.RECRUITING
  const cancelDisabled = [PARTY_STATUS.CLOSED, PARTY_STATUS.CANCELLED].includes(party.status)

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`party:join:start:${party.id}`)
      .setLabel("เข้าร่วมปาร์ตี้")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(joinDisabled),
    new ButtonBuilder()
      .setCustomId(`party:confirm:${party.id}`)
      .setLabel("ยืนยันปาร์ตี้")
      .setStyle(ButtonStyle.Success)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`party:refresh:${party.id}`)
      .setLabel("รีเฟรช")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`party:close_recruitment:${party.id}`)
      .setLabel("ปิดรับสมัคร")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closeRecruitmentDisabled),
    new ButtonBuilder()
      .setCustomId(`party:cancel:${party.id}`)
      .setLabel("ยกเลิกปาร์ตี้")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cancelDisabled)
  )

  return [actionRow]
}

function buildClassSelectRow(partyId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`party:class:${partyId}`)
    .setPlaceholder("เลือกอาชีพของคุณ")
    .addOptions(
      dragonNestClasses.slice(0, 25).map((job) => ({
        label: job.label,
        value: job.key
      }))
    )

  return new ActionRowBuilder().addComponents(menu)
}

function buildJoinConfirmRows(partyId, classKey) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`party:join:confirm:${partyId}:${classKey}`)
        .setLabel("ยืนยันที่จะเข้าร่วม")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`party:join:start:${partyId}`)
        .setLabel("เปลี่ยนอาชีพ")
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

function buildPartyCancelConfirmRows(partyId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`party:cancel_confirm:${partyId}`)
        .setLabel("ยืนยันที่จะยกเลิก")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`party:cancel_abort:${partyId}`)
        .setLabel("เก็บปาร์ตี้ไว้")
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

function buildPartyFinishSuggestionRows(partyId, { disabled = false } = {}) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`party:finish_now:${partyId}`)
        .setLabel("เสร็จสิ้น")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`party:finish_abort:${partyId}`)
        .setLabel("ไว้ทีหลัง")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ]
}

function buildScheduleEmbed(event, party) {
  const acceptedMentions = event.votes
    .filter((vote) => vote.vote === SCHEDULE_VOTE.ACCEPT)
    .map((vote) => `<@${vote.user_id}>`)
    .join(", ") || "-"

  const deniedMentions = event.votes
    .filter((vote) => vote.vote === SCHEDULE_VOTE.DENY)
    .map((vote) => `<@${vote.user_id}>`)
    .join(", ") || "-"

  return new EmbedBuilder()
    .setTitle("Schedule Vote")
    .setDescription(event.description || `โหวตตารางนัดเวลาสำหรับปาร์ตี้ ${party.name}`)
    .setColor(
      event.status === SCHEDULE_STATUS.LOCKED
        ? 0x1c7ed6
        : event.status === SCHEDULE_STATUS.CANCELLED
          ? 0xe03131
          : 0xf08c00
    )
    .addFields(
      {
        name: "ปาร์ตี้",
        value: party ? `${party.name}` : `#${event.party_id}`,
        inline: true
      },
      {
        name: "สถานะ",
        value: scheduleStatusLabel(event.status),
        inline: true
      },
      {
        name: "เวลา",
        value: renderScheduleWindow(event),
        inline: false
      },
      {
        name: "ยอมรับ",
        value: truncate(acceptedMentions),
        inline: false
      },
      {
        name: "ปฏิเสธ",
        value: truncate(deniedMentions),
        inline: false
      }
    )
    .setFooter({
      text: `ตารางเวลา #${event.id} | ไทม์โซน: ${event.timezone || "Asia/Bangkok"}`
    })
}

function buildScheduleBoardOverviewEmbeds(entries, guildId) {
  const sortedEntries = [...entries].sort((a, b) => (a.start_at_unix || 0) - (b.start_at_unix || 0))

  if (!sortedEntries.length) {
    return [
      new EmbedBuilder()
        .setTitle("Schedule Board")
        .setDescription("ยังไม่มีการกำหนดตารางนัดเวลาสำหรับปาร์ตี้.")
        .setColor(0x495057)
    ]
  }

  const chunks = []
  for (let index = 0; index < sortedEntries.length; index += 8) {
    chunks.push(sortedEntries.slice(index, index + 8))
  }

  return chunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setTitle(index === 0 ? "ตารางนัดเวลา" : `Schedule Board หน้า ${index + 1}`)
      .setDescription(
        index === 0
          ? `ตารางการนัดเวลาปาร์ตี้\nมีรายการทั้งหมด: **${sortedEntries.length}** ปาร์ตี้`
          : "ตารางการนัดเวลาปาร์ตี้"
      )
      .setColor(0x1971c2)

    for (const entry of chunk) {
      const roleMention = entry.party_role_id ? `<@&${entry.party_role_id}>` : entry.party_name
      const partyRoom = entry.party_channel_id ? `<#${entry.party_channel_id}>` : "-"
      const voteJumpUrl = entry.vote_message_id && entry.source_channel_id
        ? `https://discord.com/channels/${entry.guild_id}/${entry.source_channel_id}/${entry.vote_message_id}`
        : null
      const jumpLine = voteJumpUrl ? `\nดูข้อความโหวต: [Jump ไปยังโพสต์](${voteJumpUrl})` : ""
      const lines = [
        `เวลาลง: ${renderScheduleWindow(entry)}`,
        `หัวหน้าปาร์ตี้: <@${entry.leader_id}>`,
        `ยศปาร์ตี้: ${roleMention}`,
        `ห้องปาร์ตี้: ${partyRoom}`
      ]

      embed.addFields({
        name: `ตี้ ${entry.party_name}`,
        value: truncate(`${lines.join("\n")}${jumpLine}`),
        inline: false
      })
    }

    return embed
  })
}

function buildScheduleActionRows(event) {
  const disabled = event.status !== SCHEDULE_STATUS.VOTING

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule:vote:${event.id}:${SCHEDULE_VOTE.ACCEPT}`)
        .setLabel("ยอมรับ")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`schedule:vote:${event.id}:${SCHEDULE_VOTE.DENY}`)
        .setLabel("ปฏิเสธ")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    )
  ]
}

function buildPartyConfirmationNotice(party) {
  const mentions = party.members
    .filter((member) => ["joined", "confirmed"].includes(member.join_status))
    .map((member) => `<@${member.user_id}>`)
    .join(" ")

  return `${mentions}\nรบกวนสมาชิกทุกคนกดปุ่ม "ยืนยันปาร์ตี้" ที่โพสต์รับคน เพื่อเริ่มจัดตั้งปาร์ตี้.`
}

function buildPartyActivationNotice(party) {
  const roleMention = party.party_role_id ? `<@&${party.party_role_id}>` : party.name
  const channelMention = party.party_channel_id ? `<#${party.party_channel_id}>` : "private party channel"

  return `${roleMention} พร้อมแล้ว. ช่องของปาร์ตี้คุณคือ ${channelMention}.`
}

function buildScheduleLockedNotice(event) {
  const boardMention = event.board_channel_id ? `<#${event.board_channel_id}>` : "the schedule board"
  return `ตารางนัดเวลาได้รับการล็อกแล้วที่ ${event.proposed_start_at}. ตารางนี้ถูกโพสต์ไปที่ ${boardMention}.`
}

function buildScheduleCancelledNotice(event) {
  return `ตารางนัดเวลาถูกยกเลิกแล้ว. เหตุผล: ${event.cancelled_reason || "มีสมาชิกไม่สะดวกสำหรับช่วงเวลานั้น."}`
}

module.exports = {
  buildClassSelectRow,
  buildPartyCancelConfirmRows,
  buildJoinConfirmRows,
  buildPartyActionRows,
  buildPartyActivationNotice,
  buildPartyConfirmationNotice,
  buildPartyEmbed,
  buildPartyFinishSuggestionRows,
  buildScheduleActionRows,
  buildScheduleBoardOverviewEmbeds,
  buildScheduleCancelledNotice,
  buildScheduleEmbed,
  buildScheduleLockedNotice,
  getClassOption
}
