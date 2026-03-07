const fs = require("fs")
const path = require("path")

module.exports = (client) => {

  const eventsPath = path.join(__dirname, "../events")
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"))

  for (const file of eventFiles) {

    const event = require(path.join(eventsPath, file))
    const eventName = file.split(".")[0]

    client.on(eventName, (...args) => event(...args, client))

  }

  console.log(`✅ Loaded ${eventFiles.length} events`)

}