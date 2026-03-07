const { ChannelType } = require('discord.js');
const config = require('../config/config.json');

module.exports.handleVoiceUpdate = async (oldState, newState) => {

  if (!config.lobbyChannel) return;

  if (newState.channelId === config.lobbyChannel) {

    const guild = newState.guild;

    const channel = await guild.channels.create({
      name: `${newState.member.user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parent
    });

    await newState.member.voice.setChannel(channel);
  }

  if (
    oldState.channel &&
    oldState.channel.members.size === 0 &&
    oldState.channel.id !== config.lobbyChannel
  ) {
    try {
      await oldState.channel.delete();
    } catch {}
  }

};