const { handleVoiceUpdate } = require("../services/voiceRoomService")

module.exports = {
  name: "voiceStateUpdate",

  async execute(oldState, newState, client) {
    await handleVoiceUpdate(oldState, newState, client)
  }
}