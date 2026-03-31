require("dotenv").config()

const { createClient } = require("@libsql/client")

const databaseUrl = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!databaseUrl) {
  throw new Error("Missing TURSO_DATABASE_URL in environment variables.")
}

if (!authToken) {
  throw new Error("Missing TURSO_AUTH_TOKEN in environment variables.")
}

const db = createClient({
  url: databaseUrl,
  authToken
})

module.exports = db
