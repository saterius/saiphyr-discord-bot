require("dotenv").config()

const fs = require("fs")
const path = require("path")

const db = require("./client")

const schemaDir = path.join(__dirname, "schema")

async function loadSchemaFiles() {
  const files = fs
    .readdirSync(schemaDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))

  return files.map((file) => ({
    name: file,
    sql: fs.readFileSync(path.join(schemaDir, file), "utf8").trim()
  }))
}

async function applySchemaFile(file) {
  if (!file.sql) {
    return
  }

  console.log(`Applying ${file.name}...`)
  await db.executeMultiple(file.sql)
}

async function main() {
  const files = await loadSchemaFiles()

  if (!files.length) {
    throw new Error("No schema files found in db/schema.")
  }

  for (const file of files) {
    await applySchemaFile(file)
  }

  console.log("Database schema initialized successfully.")
}

main()
  .catch((error) => {
    console.error("Failed to initialize database schema.")
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.close()
  })
