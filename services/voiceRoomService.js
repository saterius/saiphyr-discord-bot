const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config/config.json');

module.exports.handleVoiceUpdate = async (oldState, newState) => {

  if (!config.lobbyChannel) return;

  // เมื่อมีคนเข้าห้องสร้างห้อง
  if (newState.channelId === config.lobbyChannel) {

    const guild = newState.guild;

    const channel = await guild.channels.create({
      name: `${newState.member.user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parent,

      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
          ]
        },
        {
          id: newState.member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers
          ]
        }
      ]
    });

    await newState.member.voice.setChannel(channel);
  }

  // ลบห้องเมื่อว่าง
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