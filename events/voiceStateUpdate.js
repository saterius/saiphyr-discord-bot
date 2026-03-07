const { handleVoiceUpdate } = require("../services/voiceRoomService");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    await handleVoiceUpdate(oldState, newState);
  }
};