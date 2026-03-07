const voiceRoomService = require('../services/voiceRoomService');

module.exports = (client) => {

  client.on('voiceStateUpdate', async (oldState, newState) => {
    await voiceRoomService.handleVoiceUpdate(oldState, newState);
  });

};