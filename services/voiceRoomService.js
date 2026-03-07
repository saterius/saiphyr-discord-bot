const { ChannelType, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/voiceChannels.json");

module.exports.handleVoiceUpdate = async (oldState, newState) => {

  const data = JSON.parse(fs.readFileSync(dataPath));
  const lobbyChannel = data[newState.guild.id];

  if (!lobbyChannel) return;

  // เมื่อมีคนเข้าห้องสร้างห้อง
  if (!oldState.channelId && newState.channelId === lobbyChannel) {

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
    oldState.channel.id !== lobbyChannel
  ) {
    try {
      await oldState.channel.delete();
    } catch (err) {
      console.log("Delete channel error:", err);
    }
  }

};