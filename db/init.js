require("dotenv").config()

const fs = require("fs")
const path = require("path")

const db = require("./client")

const schemaDir = path.join(__dirname, "schema")

function schemaSort(a, b) {
  const matchA = a.match(/^(\d+)/)
  const matchB = b.match(/^(\d+)/)
  const orderA = matchA ? Number(matchA[1]) : Number.MAX_SAFE_INTEGER
  const orderB = matchB ? Number(matchB[1]) : Number.MAX_SAFE_INTEGER

  if (orderA !== orderB) {
    return orderA - orderB
  }

  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

async function columnExists(tableName, columnName) {
  const result = await db.execute(`PRAGMA table_info(${tableName})`)
  return result.rows.some((row) => row.name === columnName)
}

async function loadSchemaFiles() {
  const files = fs
    .readdirSync(schemaDir)
    .filter((file) => file.endsWith(".sql"))
    .sort(schemaSort)

  return files.map((file) => ({
    name: file,
    sql: fs.readFileSync(path.join(schemaDir, file), "utf8").trim()
  }))
}

async function applySchemaFile(file) {
  if (!file.sql) {
    return
  }

  if (file.name === "11_party_type_migration.sql") {
    const alreadyExists = await columnExists("parties", "party_type")
    if (alreadyExists) {
      console.log(`Skipping ${file.name} (party_type already exists).`)
      return
    }
  }

  if (file.name === "12_party_planned_time_migration.sql") {
    const hasPlannedStart = await columnExists("parties", "planned_start_at_unix")
    const hasPlannedTimezone = await columnExists("parties", "planned_timezone")

    if (hasPlannedStart && hasPlannedTimezone) {
      console.log(`Skipping ${file.name} (planned time columns already exist).`)
      return
    }
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
