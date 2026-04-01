const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js")

const partyService = require("../services/partyService")
const {
  createPartyCalculation
} = require("../services/partyCalculationService")
const { finishParty } = require("../services/partyLifecycleService")
const {
  getPartyChannelConfig,
  getPartyFinderConfig
} = require("../services/guildConfigService")
const { PARTY_TYPE } = require("../services/partyConstants")
const ServiceError = require("../services/serviceError")
const {
  refreshPartyRecruitmentMessage
} = require("../services/partyMessageService")
const {
  buildPartyActionRows,
  buildPartyEmbed
} = require("../utils/partyUi")

function formatPartyType(type) {
  return type === PARTY_TYPE.STATIC ? "ประจำ" : "เฉพาะกิจ"
}

function parseGoldExpression(expression) {
  const normalized = String(expression || "")
    .replace(/\s+/g, "")
    .replace(/,/g, "")

  if (!normalized) {
    throw new ServiceError("กรุณาใส่รายการเงิน เช่น 500+500+40+700", "VALIDATION_ERROR")
  }

  if (!/^\d+(?:\+\d+)*$/.test(normalized)) {
    throw new ServiceError(
      "รูปแบบจำนวนเงินไม่ถูกต้อง ใช้ได้เฉพาะตัวเลขคั่นด้วย + เช่น 500+500+40+700",
      "VALIDATION_ERROR"
    )
  }

  return normalized.split("+").map((value) => Number(value))
}

function formatGold(value) {
  const formatted = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2
  })

  return `${formatted}G`
}

function buildBangkokUnixTimestamp(year, month, day, hour, minute) {
  const utcMillis = Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0)
  const bangkokDate = new Date(utcMillis + (7 * 60 * 60 * 1000))

  if (
    bangkokDate.getUTCFullYear() !== year ||
    bangkokDate.getUTCMonth() !== month - 1 ||
    bangkokDate.getUTCDate() !== day ||
    bangkokDate.getUTCHours() !== hour ||
    bangkokDate.getUTCMinutes() !== minute
  ) {
    throw new ServiceError(
      "วันหรือเวลาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
      "INVALID_PARTY_DATETIME",
      { year, month, day, hour, minute }
    )
  }

  return Math.floor(utcMillis / 1000)
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("จัดการปาร์ตี้ Dragon Nest")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("สร้างโพสต์รับสมาชิกเข้าปาร์ตี้")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("ชื่อปาร์ตี้")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("เลือกประเภทของปาร์ตี้")
            .setRequired(true)
            .addChoices(
              { name: "ประจำ", value: PARTY_TYPE.STATIC },
              { name: "เฉพาะกิจ", value: PARTY_TYPE.AD_HOC }
            )
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("คำอธิบายปาร์ตี้")
        )
        .addIntegerOption((option) =>
          option
            .setName("year")
            .setDescription("ปีสำหรับปาร์ตี้เฉพาะกิจ")
            .setMinValue(2025)
            .setMaxValue(2100)
        )
        .addIntegerOption((option) =>
          option
            .setName("month")
            .setDescription("เดือนสำหรับปาร์ตี้เฉพาะกิจ")
            .setMinValue(1)
            .setMaxValue(12)
        )
        .addIntegerOption((option) =>
          option
            .setName("day")
            .setDescription("วันที่สำหรับปาร์ตี้เฉพาะกิจ")
            .setMinValue(1)
            .setMaxValue(31)
        )
        .addIntegerOption((option) =>
          option
            .setName("hour")
            .setDescription("ชั่วโมงสำหรับปาร์ตี้เฉพาะกิจ")
            .setMinValue(0)
            .setMaxValue(23)
        )
        .addIntegerOption((option) =>
          option
            .setName("minute")
            .setDescription("นาทีสำหรับปาร์ตี้เฉพาะกิจ")
            .setMinValue(0)
            .setMaxValue(59)
        )
        .addIntegerOption((option) =>
          option
            .setName("max_members")
            .setDescription("จำนวนผู้เล่น")
            .setMinValue(2)
            .setMaxValue(8)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("แสดงข้อมูลปาร์ตี้")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("แสดงรายชื่อของแต่ละปาร์ตี้")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("kick")
        .setDescription("เตะผู้เล่นออกจากปาร์ตี้")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("ผู้เล่นที่ต้องการเตะออก")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่เตะออก")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("ออกจากปาร์ตี้ที่คุณอยู่")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่ออกจากปาร์ตี้")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("ปิด หรือ ยกเลิกปาร์ตี้")
        .addIntegerOption((option) =>
          option
            .setName("party_id")
            .setDescription("Party ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("สถานะ")
            .setRequired(true)
            .addChoices(
              { name: "closed", value: "closed" },
              { name: "cancelled", value: "cancelled" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่ปิด")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("finish")
        .setDescription("จบปาร์ตี้นี้")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("เหตุผลที่จบ")
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cal")
        .setDescription("คำนวณเงินหารแจกจ่ายกันในปาร์ตี้")
        .addStringOption((option) =>
          option
            .setName("amounts")
            .setDescription("จำนวนเงินคั่นด้วยเครื่องหมาย +, เช่น 500+500+40+700")
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("stamps")
            .setDescription("จำนวนสแตมป์ที่ใช้")
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption((option) =>
          option
            .setName("members")
            .setDescription("จำนวนคนในปาร์ตี้")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(8)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === "create") {
      const name = interaction.options.getString("name")
      const description = interaction.options.getString("description")
      const partyType = interaction.options.getString("type")
      const year = interaction.options.getInteger("year")
      const month = interaction.options.getInteger("month")
      const day = interaction.options.getInteger("day")
      const hour = interaction.options.getInteger("hour")
      const minute = interaction.options.getInteger("minute")
      const maxMembers = interaction.options.getInteger("max_members") || 8
      const partyChannelConfig = await getPartyChannelConfig(interaction.guildId)
      const partyFinderConfig = await getPartyFinderConfig(interaction.guildId)

      if (!partyChannelConfig?.category_channel_id) {
        throw new ServiceError(
          "ยังไม่ได้เลือกหมวดหมู่แชนแนลสำหรับสร้างปาร์ตี้. โปรดแจ้งผู้ดูแลให้ตั้งค่า /setpartychannel ก่อน.",
          "PARTY_CATEGORY_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      if (!partyFinderConfig?.finder_channel_id) {
        throw new ServiceError(
          "ยังไม่ได้เลือกแชนแนลสำหรับหาปาร์ตี้. โปรดแจ้งผู้ดูแลให้ตั้งค่า /setpartyfinderchannel ก่อน.",
          "PARTY_FINDER_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      if (interaction.channelId !== partyFinderConfig.finder_channel_id) {
        throw new ServiceError(
          `ใช้คำสั่ง /party create ได้แค่ใน <#${partyFinderConfig.finder_channel_id}> เท่านั้น.`,
          "INVALID_PARTY_FINDER_CHANNEL",
          {
            guildId: interaction.guildId,
            expectedChannelId: partyFinderConfig.finder_channel_id,
            actualChannelId: interaction.channelId
          }
        )
      }

      const hasFullPlannedTime = [year, month, day, hour, minute].every((value) => value !== null)
      const hasAnyPlannedTime = [year, month, day, hour, minute].some((value) => value !== null)

      if (partyType === PARTY_TYPE.AD_HOC && !hasFullPlannedTime) {
        throw new ServiceError(
          "ปาร์ตี้ประเภทเฉพาะกิจต้องระบุ ปี เดือน วัน ชั่วโมง และนาที ตอนสร้างปาร์ตี้ด้วย",
          "AD_HOC_TIME_REQUIRED"
        )
      }

      if (hasAnyPlannedTime && !hasFullPlannedTime) {
        throw new ServiceError(
          "ถ้าจะใส่เวลานัด กรุณาใส่ ปี เดือน วัน ชั่วโมง และนาที ให้ครบ",
          "INCOMPLETE_PARTY_TIME"
        )
      }

      const plannedStartAtUnix = hasFullPlannedTime
        ? buildBangkokUnixTimestamp(year, month, day, hour, minute)
        : null

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const party = await partyService.createParty({
        guildId: interaction.guildId,
        leaderId: interaction.user.id,
        name,
        description,
        partyType,
        plannedStartAtUnix,
        plannedTimezone: plannedStartAtUnix ? "Asia/Bangkok" : null,
        recruitChannelId: interaction.channelId,
        maxMembers
      })

      const recruitMessage = await interaction.channel.send({
        embeds: [buildPartyEmbed(party)],
        components: buildPartyActionRows(party)
      })

      const updatedParty = await partyService.updatePartyResources({
        partyId: party.id,
        recruitChannelId: interaction.channelId,
        recruitMessageId: recruitMessage.id
      })

      await interaction.editReply({
        content: `Party created: #${updatedParty.id} (${formatPartyType(updatedParty.party_type)}) in ${interaction.channel}.`
      })

      return
    }

    if (subcommand === "show") {
      const partyId = interaction.options.getInteger("party_id")
      const party = await partyService.getPartyById(partyId)

      await interaction.reply({
        embeds: [buildPartyEmbed(party)],
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "list") {
      const parties = await partyService.listGuildParties(interaction.guildId)

      const content = parties.length
        ? parties
          .map((party) => `#${party.id} | ${party.name} | ${formatPartyType(party.party_type)} | ${party.status} | ${party.active_member_count}/${party.max_members}`)
          .join("\n")
        : "ไม่พบปาร์ตี้."

      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
      })

      return
    }

    if (subcommand === "kick") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const member = interaction.options.getUser("member")
      const reason = interaction.options.getString("reason")

      const result = await partyService.kickPartyMember({
        partyId,
        actorId: interaction.user.id,
        targetUserId: member.id,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `${member} ถูกนำออกจากปาร์ตี้ #${partyId}.${result.reopenedRecruitment ? " เปิดรับสมาชิกอีกครั้ง." : ""}`
      })

      return
    }

    if (subcommand === "leave") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const reason = interaction.options.getString("reason") || "left"

      const result = await partyService.leaveParty({
        partyId,
        userId: interaction.user.id,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `คุณได้ออกจากปาร์ตี้ #${partyId}.${result.reopenedRecruitment ? " เปิดรับสมาชิกอีกครั้ง." : ""}`
      })

      return
    }

    if (subcommand === "close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const partyId = interaction.options.getInteger("party_id")
      const status = interaction.options.getString("status")
      const reason = interaction.options.getString("reason")

      await partyService.updatePartyStatus({
        partyId,
        actorId: interaction.user.id,
        status,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      await interaction.editReply({
        content: `ปาร์ตี้ #${partyId} อัปเดตสถานะเป็น ${status}.`
      })

      return
    }

    if (subcommand === "finish") {
      const party = await partyService.getPartyByChannelId(interaction.channelId)
      if (!party) {
        throw new ServiceError(
          "ใช้คำสั่ง /party finish ได้เฉพาะในช่องของปาร์ตี้เท่านั้น.",
          "PARTY_CHANNEL_REQUIRED",
          { channelId: interaction.channelId }
        )
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const reason = interaction.options.getString("reason") || "Party finished"
      const result = await finishParty({
        guild: interaction.guild,
        partyId: party.id,
        actorId: interaction.user.id,
        reason
      })

      await refreshPartyRecruitmentMessage(interaction.client, party.id)

      const deletedBits = []
      if (result.deletedResources) {
        if (result.removedRole) {
          deletedBits.push("role removed")
        }
        if (result.removedChannel) {
          deletedBits.push("channel deleted")
        }
      }

      const extra = deletedBits.length ? ` (${deletedBits.join(", ")})` : ""

      await interaction.editReply({
        content: `ปาร์ตี้ #${party.id} จบแล้ว.${extra}`
      })

      return
    }

    if (subcommand === "cal") {
      const amountsInput = interaction.options.getString("amounts")
      const stampCount = interaction.options.getInteger("stamps")
      const memberCount = interaction.options.getInteger("members")

      const amounts = parseGoldExpression(amountsInput)
      const grossTotal = amounts.reduce((sum, value) => sum + value, 0)
      const stampCost = stampCount * 2
      const netTotal = grossTotal - stampCost

      if (netTotal < 0) {
        throw new ServiceError(
          "ยอดหลังหักค่าสแตมป์ติดลบ กรุณาตรวจสอบจำนวนเงินหรือจำนวนสแตมป์อีกครั้ง",
          "VALIDATION_ERROR",
          { grossTotal, stampCost, memberCount }
        )
      }

      const perMember = netTotal / memberCount
      const stampBonus = stampCount > 0 ? stampCost / memberCount : 0
      const currentParty = await partyService.getPartyByChannelId(interaction.channelId).catch(() => null)
      const roleMention = currentParty?.party_role_id ? `<@&${currentParty.party_role_id}>` : null
      const content = [
        roleMention,
        "สรุปยอดเงินปาร์ตี้",
        `รายการเงิน: ${amounts.join(" + ")} = ${formatGold(grossTotal)}`,
        `ค่าสแตมป์: ${stampCount} x 2 = ${formatGold(stampCost)}`,
        `เงินหลังหักค่าสแตมป์: ${formatGold(netTotal)}`,
        `หาร ${memberCount} คน = ${formatGold(perMember)} / คน`,
        stampCount > 0
          ? `คนที่ออกสแตมป์จะดึงเพิ่มได้ ${formatGold(stampBonus)}`
          : "ไม่มีค่าสแตมป์ที่ต้องชดเชยเพิ่ม",
        "",
        `ถ้าตรวจสอบยอดเรียบร้อยแล้ว ให้สมาชิกกดรีแอค ✅ ให้ครบ ${memberCount} คน`
      ].filter(Boolean).join("\n")

      const message = await interaction.channel.send({
        content,
        allowedMentions: roleMention
          ? { roles: [currentParty.party_role_id] }
          : undefined
      })

      await message.react("✅").catch(() => null)

      if (currentParty) {
        await createPartyCalculation({
          partyId: currentParty.id,
          creatorId: interaction.user.id,
          channelId: interaction.channelId,
          messageId: message.id,
          amountsText: amounts.join("+"),
          grossTotal,
          stampCount,
          stampCost,
          netTotal,
          memberCount
        })
      }

      await interaction.reply({
        content: "โพสต์สรุปยอดเงินถูกส่งไว้ในห้องนี้แล้ว",
        flags: MessageFlags.Ephemeral
      })

      return
    }
  }
}
