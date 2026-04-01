require("dotenv").config()

const {
  clearGlobalCommands,
  getRestClient
} = require("./utils/commandRegistry")

;(async () => {
  try {
    const rest = getRestClient()

    console.log("Clearing global commands...")
    await clearGlobalCommands(rest)
    console.log("Global commands cleared")
  } catch (error) {
    console.error(error)
  }
})()
