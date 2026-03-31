const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getVoiceConfig } = require("./guildConfigService");

module.exports.handleVoiceUpdate = async (oldState, newState) => {
  const guild = newState.guild;
  const voiceConfig = await getVoiceConfig(guild.id);
  const lobbyChannelId = voiceConfig?.lobby_channel_id;
  if (!lobbyChannelId) return;

  const lobby = guild.channels.cache.get(lobbyChannelId);
  if (!lobby) return;

  const permissionScope = lobby.parent || lobby;
  const me = guild.members.me || await guild.members.fetchMe();

  if (newState.channelId === lobbyChannelId && oldState.channelId !== lobbyChannelId) {
    const scopePerms = permissionScope.permissionsFor(me);
    const canManageChannels = scopePerms?.has(PermissionFlagsBits.ManageChannels);
    const canMoveMembers = scopePerms?.has(PermissionFlagsBits.MoveMembers);

    if (!canManageChannels || !canMoveMembers) {
      console.error(
        `[voiceRoomService] Missing permissions in guild ${guild.id}: ManageChannels=${Boolean(canManageChannels)}, MoveMembers=${Boolean(canMoveMembers)}.`
      );
      return;
    }

    const channel = await guild.channels.create({
      name: `${newState.member.user.username}'s Room`,
      type: ChannelType.GuildVoice,
      parent: lobby.parent,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
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

  if (oldState.channel) {
    const lobbyCategory = lobby.parentId;

    if (
      oldState.channel.members.size === 0 &&
      oldState.channel.id !== lobbyChannelId &&
      oldState.channel.parentId === lobbyCategory
    ) {
      const canManageChannels = permissionScope
        .permissionsFor(me)
        ?.has(PermissionFlagsBits.ManageChannels);

      if (!canManageChannels) {
        console.error(
          `[voiceRoomService] Missing ManageChannels to delete empty room in guild ${guild.id}.`
        );
        return;
      }

      try {
        await oldState.channel.delete();
      } catch (err) {
        console.log("Delete channel error:", err);
      }
    }
  }
};
