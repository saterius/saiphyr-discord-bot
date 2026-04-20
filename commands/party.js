const {
  ChannelType,
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
  getCalChannelConfig,
  getPartyChannelConfig,
  getPartyFinderConfig
} = require("../services/guildConfigService")
const {
  MEMBER_STATUS,
  PARTY_STATUS,
  PARTY_TYPE
} = require("../services/partyConstants")
const ServiceError = require("../services/serviceError")
const {
  sendPartyConfirmationPrompt,
  syncGuildScheduleBoard,
  refreshPartyRecruitmentMessage
} = require("../services/partyMessageService")
const {
  buildPartyActionRows,
  buildPartyEmbed,
  buildClassSelectRow,
  getClassOption
} = require("../utils/partyUi")
const dragonNestClasses = require("../data/dragonNestClasses")
const { parseBangkokDateTimeRange } = require("../utils/dateTimeRange")

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

async function syncPartyRoleForMemberChange(interaction, party, oldUserId, newUserId) {
  if (!interaction.guild || !party?.party_role_id) {
    return false
  }

  const role = interaction.guild.roles.cache.get(party.party_role_id)
    || await interaction.guild.roles.fetch(party.party_role_id).catch(() => null)

  if (!role) {
    return false
  }

  const [oldGuildMember, newGuildMember] = await Promise.all([
    interaction.guild.members.fetch(oldUserId).catch(() => null),
    interaction.guild.members.fetch(newUserId).catch(() => null)
  ])

  await oldGuildMember?.roles.remove(role, `Changed party ${party.id} member`).catch(() => null)
  await newGuildMember?.roles.add(role, `Changed party ${party.id} member`).catch(() => null)

  return true
}

async function syncPartyRoleForAddedMember(interaction, party, userId) {
  if (!interaction.guild || !party?.party_role_id) {
    return false
  }

  const role = interaction.guild.roles.cache.get(party.party_role_id)
    || await interaction.guild.roles.fetch(party.party_role_id).catch(() => null)

  if (!role) {
    return false
  }

  const guildMember = await interaction.guild.members.fetch(userId).catch(() => null)
  if (!guildMember) {
    return false
  }

  await guildMember.roles.add(role, `Added to party ${party.id}`).catch(() => null)

  return true
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
            .setName("party_name")
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
        .addStringOption((option) =>
          option
            .setName("datetime_range")
            .setDescription("รูปแบบ DD-MM-YYYY hh:mm-hh:mm เช่น 25-04-2026 21:30-22:30")
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
        .setName("import")
        .setDescription("ผูกปาร์ตี้เดิมที่มี role และห้องอยู่แล้วเข้ากับระบบ")
        .addStringOption((option) =>
          option
            .setName("party_name")
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
        .addUserOption((option) =>
          option
            .setName("leader")
            .setDescription("หัวหน้าปาร์ตี้")
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("ยศของปาร์ตี้ที่มีอยู่แล้ว")
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("ห้องข้อความของปาร์ตี้ที่มีอยู่แล้ว")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("คำอธิบายปาร์ตี้")
        )
        .addStringOption((option) =>
          option
            .setName("datetime_range")
            .setDescription("รูปแบบ DD-MM-YYYY hh:mm-hh:mm เช่น 25-04-2026 21:30-22:30")
        )
        .addIntegerOption((option) =>
          option
            .setName("max_members")
            .setDescription("จำนวนสมาชิกสูงสุด")
            .setMinValue(2)
            .setMaxValue(8)
        )
        .addUserOption((option) =>
          option
            .setName("member_1")
            .setDescription("สมาชิกคนที่ 1")
        )
        .addUserOption((option) =>
          option
            .setName("member_2")
            .setDescription("สมาชิกคนที่ 2")
        )
        .addUserOption((option) =>
          option
            .setName("member_3")
            .setDescription("สมาชิกคนที่ 3")
        )
        .addUserOption((option) =>
          option
            .setName("member_4")
            .setDescription("สมาชิกคนที่ 4")
        )
        .addUserOption((option) =>
          option
            .setName("member_5")
            .setDescription("สมาชิกคนที่ 5")
        )
        .addUserOption((option) =>
          option
            .setName("member_6")
            .setDescription("สมาชิกคนที่ 6")
        )
        .addUserOption((option) =>
          option
            .setName("member_7")
            .setDescription("สมาชิกคนที่ 7")
        )
        .addUserOption((option) =>
          option
            .setName("member_8")
            .setDescription("สมาชิกคนที่ 8")
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
        .setName("memberchange")
        .setDescription("Change one party member to another member")
        .addUserOption((option) =>
          option
            .setName("old_member")
            .setDescription("Current party member to replace")
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName("new_member")
            .setDescription("New member to add")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Class for the new member")
            .setRequired(true)
            .addChoices(
              ...dragonNestClasses.map((job) => ({
                name: job.label,
                value: job.key
              }))
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("addmember")
        .setDescription("Add a member to the active party in this channel")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to add")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Class for the member")
            .setRequired(true)
            .addChoices(
              ...dragonNestClasses.map((job) => ({
                name: job.label,
                value: job.key
              }))
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("changeclass")
        .setDescription("Change your class in this party channel")
        .addStringOption((option) =>
          option
            .setName("class")
            .setDescription("Your new class")
            .setRequired(true)
            .addChoices(
              ...dragonNestClasses.map((job) => ({
                name: job.label,
                value: job.key
              }))
            )
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
      const name = interaction.options.getString("party_name")
      const description = interaction.options.getString("description")
      const partyType = interaction.options.getString("type")
      const dateTimeRangeInput = interaction.options.getString("datetime_range")
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

      const parsedRange = parseBangkokDateTimeRange(dateTimeRangeInput, {
        required: partyType === PARTY_TYPE.AD_HOC,
        errorCode: "INVALID_PARTY_DATETIME",
        label: "ช่วงเวลาปาร์ตี้ "
      })

      if (partyType === PARTY_TYPE.AD_HOC && !parsedRange) {
        throw new ServiceError(
          "ปาร์ตี้ประเภทเฉพาะกิจต้องระบุช่วงเวลานัดในรูปแบบ DD-MM-YYYY hh:mm-hh:mm",
          "AD_HOC_TIME_REQUIRED"
        )
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const party = await partyService.createParty({
        guildId: interaction.guildId,
        leaderId: interaction.user.id,
        name,
        description,
        partyType,
        plannedStartAtUnix: parsedRange?.startAtUnix || null,
        plannedEndAtUnix: parsedRange?.endAtUnix || null,
        plannedTimezone: parsedRange?.timezone || null,
        recruitChannelId: interaction.channelId,
        maxMembers
      })

      await interaction.editReply({
        content: `สร้างปาร์ตี้ #${party.id} (${formatPartyType(party.party_type)}) แล้ว กรุณาเลือกอาชีพของหัวหน้าปาร์ตี้ก่อนเพื่อโพสต์รับสมาชิก`,
        components: [buildClassSelectRow(party.id, `party:create_class:${party.id}`)]
      })

      return
    }

    if (subcommand === "import") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        throw new ServiceError(
          "คำสั่ง /party import ใช้ได้เฉพาะผู้ดูแลที่มีสิทธิ์จัดการแชนแนล",
          "MISSING_PERMISSIONS"
        )
      }

      const name = interaction.options.getString("party_name")
      const description = interaction.options.getString("description")
      const partyType = interaction.options.getString("type")
      const leader = interaction.options.getUser("leader")
      const role = interaction.options.getRole("role")
      const channel = interaction.options.getChannel("channel")
      const dateTimeRangeInput = interaction.options.getString("datetime_range")
      const maxMembers = interaction.options.getInteger("max_members") || 8
      const selectedMembers = [
        interaction.options.getUser("member_1"),
        interaction.options.getUser("member_2"),
        interaction.options.getUser("member_3"),
        interaction.options.getUser("member_4"),
        interaction.options.getUser("member_5"),
        interaction.options.getUser("member_6"),
        interaction.options.getUser("member_7"),
        interaction.options.getUser("member_8")
      ].filter(Boolean)

      const parsedRange = parseBangkokDateTimeRange(dateTimeRangeInput, {
        required: partyType === PARTY_TYPE.AD_HOC,
        errorCode: "INVALID_PARTY_DATETIME",
        label: "ช่วงเวลาปาร์ตี้ "
      })

      if (partyType === PARTY_TYPE.AD_HOC && !parsedRange) {
        throw new ServiceError(
          "ปาร์ตี้เฉพาะกิจต้องระบุช่วงเวลานัดในรูปแบบ DD-MM-YYYY hh:mm-hh:mm",
          "AD_HOC_TIME_REQUIRED"
        )
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const manualMemberIds = selectedMembers.map((member) => member.id)

      const importedParty = await partyService.importParty({
        guildId: interaction.guildId,
        leaderId: leader.id,
        actorId: interaction.user.id,
        name,
        description,
        partyType,
        plannedStartAtUnix: parsedRange?.startAtUnix || null,
        plannedEndAtUnix: parsedRange?.endAtUnix || null,
        plannedTimezone: parsedRange?.timezone || null,
        partyRoleId: role.id,
        partyChannelId: channel.id,
        memberIds: manualMemberIds,
        maxMembers
      })

      await interaction.editReply({
        content: `นำเข้าปาร์ตี้ #${importedParty.id} เรียบร้อยแล้ว สมาชิกจากยศ ${role} ถูกผูกเข้าระบบแล้ว${importedParty.members.length ? ` (${importedParty.members.length} คน)` : ""}`
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

    if (subcommand === "memberchange") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const oldMember = interaction.options.getUser("old_member")
      const newMember = interaction.options.getUser("new_member")
      const classKey = interaction.options.getString("class")
      const classOption = getClassOption(classKey)

      if (!classOption) {
        throw new ServiceError(
          "Class is not valid.",
          "VALIDATION_ERROR",
          { classKey }
        )
      }

      const partyInChannel = await partyService.getPartyByChannelId(interaction.channelId)
      if (!partyInChannel) {
        throw new ServiceError(
          "กรุณาใช้คำสั่งนี้ในห้องปาร์ตี้เท่านั้น",
          "PARTY_CHANNEL_REQUIRED",
          { channelId: interaction.channelId }
        )
      }
      const partyId = partyInChannel.id

      const result = await partyService.replacePartyMember({
        partyId,
        actorId: interaction.user.id,
        oldUserId: oldMember.id,
        newUserId: newMember.id,
        classKey,
        classLabel: classOption.label
      })

      const roleSynced = await syncPartyRoleForMemberChange(
        interaction,
        result.party,
        oldMember.id,
        newMember.id
      )

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      if (result.party.status === PARTY_STATUS.PENDING_CONFIRM) {
        await sendPartyConfirmationPrompt(interaction.client, partyId)
      }

      if ([PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(result.party.status)) {
        await syncGuildScheduleBoard(interaction.client, interaction.guildId).catch(() => null)
      }

      await interaction.editReply({
        content: `${oldMember} ถูกเปลี่ยนเป็น ${newMember} ในปาร์ตี้ #${partyId} แล้ว อาชีพ: ${classOption.label}${roleSynced ? " (อัปเดต role แล้ว)" : ""}`
      })

      return
    }

    if (subcommand === "addmember") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const member = interaction.options.getUser("member")
      const classKey = interaction.options.getString("class")
      const classOption = getClassOption(classKey)

      if (!classOption) {
        throw new ServiceError(
          "Class is not valid.",
          "VALIDATION_ERROR",
          { classKey }
        )
      }

      const partyInChannel = await partyService.getPartyByChannelId(interaction.channelId)
      if (!partyInChannel) {
        throw new ServiceError(
          "กรุณาใช้คำสั่งนี้ในห้องปาร์ตี้เท่านั้น",
          "PARTY_CHANNEL_REQUIRED",
          { channelId: interaction.channelId }
        )
      }
      const partyId = partyInChannel.id

      const result = await partyService.addPartyMember({
        partyId,
        actorId: interaction.user.id,
        userId: member.id,
        classKey,
        classLabel: classOption.label
      })

      const roleSynced = await syncPartyRoleForAddedMember(
        interaction,
        result.party,
        member.id
      )

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      if ([PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(result.party.status)) {
        await syncGuildScheduleBoard(interaction.client, interaction.guildId).catch(() => null)
      }

      await interaction.editReply({
        content: `${member} ถูกเพิ่มเข้าในปาร์ตี้ #${partyId} แล้ว อาชีพ: ${classOption.label}${roleSynced ? " (อัปเดต role แล้ว)" : ""}`
      })

      return
    }

    if (subcommand === "changeclass") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const classKey = interaction.options.getString("class")
      const classOption = getClassOption(classKey)

      if (!classOption) {
        throw new ServiceError(
          "Class is not valid.",
          "VALIDATION_ERROR",
          { classKey }
        )
      }

      const partyInChannel = await partyService.getPartyByChannelId(interaction.channelId)
      if (!partyInChannel) {
        throw new ServiceError(
          "กรุณาใช้คำสั่งนี้ในห้องปาร์ตี้เท่านั้น",
          "PARTY_CHANNEL_REQUIRED",
          { channelId: interaction.channelId }
        )
      }
      const partyId = partyInChannel.id

      const party = await partyService.updatePartyMemberClass({
        partyId,
        userId: interaction.user.id,
        classKey,
        classLabel: classOption.label
      })

      await refreshPartyRecruitmentMessage(interaction.client, partyId)

      if ([PARTY_STATUS.ACTIVE, PARTY_STATUS.SCHEDULED].includes(party.status)) {
        await syncGuildScheduleBoard(interaction.client, interaction.guildId).catch(() => null)
      }

      await interaction.editReply({
        content: `เปลี่ยนอาชีพของคุณในปาร์ตี้ #${partyId} เป็น ${classOption.label} เรียบร้อยแล้ว`
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const amountsInput = interaction.options.getString("amounts")
      const stampCount = interaction.options.getInteger("stamps")
      const memberCount = interaction.options.getInteger("members")
      const calChannelConfig = await getCalChannelConfig(interaction.guildId)

      if (!calChannelConfig?.cal_channel_id) {
        throw new ServiceError(
          "ยังไม่ได้เลือกแชนแนลสำหรับ /party cal โปรดแจ้งผู้ดูแลให้ตั้งค่า /setcalchannel ก่อน",
          "PARTY_CAL_CHANNEL_NOT_CONFIGURED",
          { guildId: interaction.guildId }
        )
      }

      const targetChannel = await interaction.client.channels.fetch(calChannelConfig.cal_channel_id).catch(() => null)

      if (!targetChannel || !targetChannel.isTextBased()) {
        throw new ServiceError(
          "ไม่พบแชนแนลที่ตั้งค่าไว้สำหรับ /party cal หรือบอทไม่สามารถส่งข้อความไปที่นั่นได้",
          "PARTY_CAL_CHANNEL_UNAVAILABLE",
          { guildId: interaction.guildId, channelId: calChannelConfig.cal_channel_id }
        )
      }

      const amounts = parseGoldExpression(amountsInput)
      const grossTotal = amounts.reduce((sum, value) => sum + value, 0)
      const stampCost = stampCount * 3
      const netTotal = grossTotal - stampCost

      if (netTotal < 0) {
        throw new ServiceError(
          "ยอดหลังหักค่าสแตมป์ติดลบ กรุณาตรวจสอบจำนวนเงินหรือจำนวนสแตมป์อีกครั้ง",
          "VALIDATION_ERROR",
          { grossTotal, stampCost, memberCount }
        )
      }

      const perMember = netTotal / memberCount
      const stampBonus = stampCount > 0 ? stampCost : 0
      const currentParty = await partyService.getPartyByChannelId(interaction.channelId).catch(() => null)
      const activeMemberIds = currentParty?.party_type === PARTY_TYPE.AD_HOC
        ? [...new Set(
          (currentParty.members || [])
            .filter((member) => [MEMBER_STATUS.JOINED, MEMBER_STATUS.CONFIRMED].includes(member.join_status))
            .map((member) => member.user_id)
        )]
        : []
      const mentionLine = currentParty?.party_type === PARTY_TYPE.AD_HOC
        ? activeMemberIds.map((userId) => `<@${userId}>`).join(" ") || null
        : (currentParty?.party_role_id ? `<@&${currentParty.party_role_id}>` : null)
      const content = [
        mentionLine,
        currentParty?.party_type === PARTY_TYPE.AD_HOC && currentParty?.name
          ? `ปาร์ตี้: ${currentParty.name}`
          : null,
        `สรุปยอดเงินปาร์ตี้ (${memberCount} คน)`,
        `รายการเงิน: ${amounts.join(" + ")} = ${formatGold(grossTotal)}`,
        `ค่าสแตมป์: ${stampCount} x 3 = ${formatGold(stampCost)}`,
        `เงินหลังหักค่าสแตมป์: ${formatGold(netTotal)}`,
        `หาร ${memberCount} คน = \`${formatGold(perMember)}\` / คน`,
        stampCount > 0
          ? `คนที่ออกสแตมป์จะดึงเพิ่มได้ ${formatGold(stampBonus)}`
          : "ไม่มีค่าสแตมป์ที่ต้องชดเชยเพิ่ม",
        "",
        `ถ้าตรวจสอบยอดเรียบร้อยแล้ว กดรีแอค ✅ เพื่อกันลืมด้วยนะครับ!`
      ].filter(Boolean).join("\n")

      const message = await targetChannel.send({
        content,
        allowedMentions: currentParty?.party_type === PARTY_TYPE.AD_HOC
          ? (activeMemberIds.length ? { users: activeMemberIds } : undefined)
          : (currentParty?.party_role_id ? { roles: [currentParty.party_role_id] } : undefined)
      })

      await message.react("✅").catch(() => null)

      if (currentParty) {
        await createPartyCalculation({
          partyId: currentParty.id,
          creatorId: interaction.user.id,
          channelId: targetChannel.id,
          messageId: message.id,
          amountsText: amounts.join("+"),
          grossTotal,
          stampCount,
          stampCost,
          netTotal,
          memberCount
        })
      }

      if (currentParty?.party_type === PARTY_TYPE.AD_HOC) {
        const result = await finishParty({
          guild: interaction.guild,
          partyId: currentParty.id,
          actorId: interaction.user.id,
          reason: "Auto-finished after /party cal for ad-hoc party",
          allowNonLeader: true
        })

        await refreshPartyRecruitmentMessage(interaction.client, currentParty.id)

        const deletedBits = []
        if (result.removedRole) {
          deletedBits.push("ลบ role แล้ว")
        }
        if (result.removedChannel) {
          deletedBits.push("ลบ channel แล้ว")
        }

        await interaction.editReply({
          content: `โพสต์สรุปยอดเงินถูกส่งไปที่ <#${targetChannel.id}> แล้ว และปาร์ตี้ #${currentParty.id} ถูกปิดเรียบร้อย${deletedBits.length ? ` (${deletedBits.join(", ")})` : ""}`
        })

        return
      }

      await interaction.editReply({
        content: `โพสต์สรุปยอดเงินถูกส่งไปที่ <#${targetChannel.id}> แล้ว`
      })

      return

      await interaction.reply({
        content: `โพสต์สรุปยอดเงินถูกส่งไปที่ <#${targetChannel.id}> แล้ว`,
        flags: MessageFlags.Ephemeral
      })

      return
    }
  }
}
