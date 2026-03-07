const { handleVoiceUpdate } = require("../services/voiceRoomService")

module.exports = {
  name: "voiceStateUpdate",

  async execute(oldState, newState, client) {
    try {
      await handleVoiceUpdate(oldState, newState, client)
    } catch (error) {
      console.error("voiceStateUpdate error:", error)
    }
  }
}
