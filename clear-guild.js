require('dotenv').config()

const { REST, Routes } = require('discord.js')

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN)

;(async () => {

  try {

    console.log("🧹 Clearing guild commands...")

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: [] }
    )

    console.log("✅ Guild commands cleared")

  } catch (error) {
    console.error(error)
  }

})()