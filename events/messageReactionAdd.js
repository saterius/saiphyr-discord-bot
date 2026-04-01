const {
  getPartyCalculationByMessageId,
  markSuggestionSent
} = require("../services/partyCalculationService")
const partyService = require("../services/partyService")
const { PARTY_TYPE } = require("../services/partyConstants")
const { sendPartyFinishSuggestion } = require("../services/partyMessageService")

module.exports = {
  name: "messageReactionAdd",

  async execute(reaction, user, client) {
    try {
      if (user.bot) {
        return
      }

      if (reaction.partial) {
        await reaction.fetch().catch(() => null)
      }

      const emojiName = reaction.emoji?.name
      if (emojiName !== "\u2705") {
        return
      }

      const calculation = await getPartyCalculationByMessageId(reaction.message.id)
      if (!calculation || Number(calculation.suggestion_sent) === 1) {
        return
      }

      const party = await partyService.getPartyById(calculation.party_id).catch(() => null)
      if (!party || party.party_channel_id !== reaction.message.channelId) {
        return
      }

      if (party.party_type !== PARTY_TYPE.AD_HOC) {
        return
      }

      const users = await reaction.users.fetch().catch(() => null)
      if (!users) {
        return
      }

      const acceptedCount = users.filter((entry) => !entry.bot).size
      if (acceptedCount < Number(calculation.member_count)) {
        return
      }

      const sent = await sendPartyFinishSuggestion(
        client || reaction.message?.client || reaction.client,
        calculation.party_id,
        reaction.message?.channel || null
      )

      if (!sent) {
        return
      }

      await markSuggestionSent(calculation.id)
    } catch (error) {
      console.error("messageReactionAdd failed:", error)
    }
  }
}
