const fs = require("fs")
const path = require("path")

module.exports = (client) => {
  async function executeEvent(event, args) {
    try {
      await event.execute(...args, client)
    } catch (error) {
      console.error(`Event ${event.name} failed:`, error)
    }
  }

  const eventsPath = path.join(__dirname, "../events")
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"))

  for (const file of eventFiles) {

    const event = require(path.join(eventsPath, file))

    if (event.once) {
      client.once(event.name, (...args) => {
        void executeEvent(event, args)
      })
    } else {
      client.on(event.name, (...args) => {
        void executeEvent(event, args)
      })
    }

  }
  
  console.log(`✅ Loaded ${eventFiles.length} events`)

}
