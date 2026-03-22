const GUILD_CARD_GIF = "https://media.discordapp.net/attachments/1351626807081701437/1485298405788876872/Sequence_01_2.gif?ex=69c15b6f&is=69c009ef&hm=341cae9dee949a8187cc8393b95ba5345a3df31d46d385e702fbfd7a0df21908&=";

const triggers = new Set([
  "!บัตรกิลด์",
  "!บัตรกิล",
  "!บัตรกิว",
  "!บัตกิว",
  "บัตกิล"
]);

module.exports = {
  name: "messageCreate",

  async execute(message) {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (!triggers.has(content)) return;

    await message.channel.send(GUILD_CARD_GIF);
  }
};
