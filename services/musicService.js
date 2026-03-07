const ytdl = require("@distube/ytdl-core");

const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
} = require("@discordjs/voice");

let connection = null;
let player = createAudioPlayer();

let queue = [];
let playing = false;

async function playNext() {

    if (queue.length === 0) {
        playing = false;
        return;
    }

    playing = true;

    const url = queue.shift();

    console.log("Playing:", url);

    const stream = ytdl(url, {
        filter: "audioonly",
        highWaterMark: 1 << 25
    });

    const resource = createAudioResource(stream);

    player.play(resource);
}

player.on(AudioPlayerStatus.Idle, () => {

    console.log("Song finished");

    playNext();

});

player.on("error", error => {

    console.error("Player error:", error);

    playing = false;

    playNext();

});

async function play(interaction, url) {

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel)
        return interaction.editReply("❌ Join voice channel first");

    if (!connection) {

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 20000);

        connection.subscribe(player);

        console.log("Connected to voice");
    }

    queue.push(url);

    if (!playing)
        playNext();

    await interaction.editReply(`🎵 Added to queue\n${url}`);
}

function skip() {
    player.stop();
}

function stop() {
    queue = [];
    player.stop();
}

function leave() {

    queue = [];
    player.stop();

    if (connection) {
        connection.destroy();
        connection = null;
    }
}

function getQueue() {
    return [...queue];
}

module.exports = {
    play,
    skip,
    stop,
    leave,
    getQueue
};
