const db = require("./client")

const TRANSIENT_QUERY_RETRY_COUNT = 3
const TRANSIENT_QUERY_RETRY_BASE_DELAY_MS = 250

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorText(error) {
  return [
    error?.message,
    error?.cause?.message,
    error?.cause?.proto?.message,
    error?.code,
    error?.cause?.code
  ]
    .filter(Boolean)
    .join(" ")
}

function isTransientLibsqlError(error) {
  if (error?.code !== "SQLITE_UNKNOWN" && error?.cause?.code !== "SQLITE_UNKNOWN") {
    return false
  }

  const errorText = getErrorText(error)
  return /S3 error/i.test(errorText)
    || /\b503\b/.test(errorText)
    || /failed to list objects/i.test(errorText)
}

function normalizeValue(value) {
  if (typeof value === "bigint") {
    const asNumber = Number(value)
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
  }

  return value
}

function mapRow(result, row) {
  return result.columns.reduce((record, columnName, index) => {
    record[columnName] = normalizeValue(row[index])
    return record
  }, {})
}

async function query(executor, sql, args = []) {
  for (let attempt = 0; attempt <= TRANSIENT_QUERY_RETRY_COUNT; attempt += 1) {
    try {
      return await executor.execute({ sql, args })
    } catch (error) {
      if (!isTransientLibsqlError(error) || attempt === TRANSIENT_QUERY_RETRY_COUNT) {
        throw error
      }

      const delayMs = TRANSIENT_QUERY_RETRY_BASE_DELAY_MS * (2 ** attempt)
      console.warn(
        `Transient libSQL query error, retrying in ${delayMs}ms (${attempt + 1}/${TRANSIENT_QUERY_RETRY_COUNT}).`
      )
      await wait(delayMs)
    }
  }
}

async function getOne(executor, sql, args = []) {
  const result = await query(executor, sql, args)

  if (!result.rows.length) {
    return null
  }

  return mapRow(result, result.rows[0])
}

async function getMany(executor, sql, args = []) {
  const result = await query(executor, sql, args)
  return result.rows.map((row) => mapRow(result, row))
}

async function run(executor, sql, args = []) {
  const result = await query(executor, sql, args)

  return {
    rowsAffected: result.rowsAffected,
    lastInsertRowid: normalizeValue(result.lastInsertRowid)
  }
}

async function withTransaction(mode, callback) {
  const transaction = await db.transaction(mode)

  try {
    const result = await callback(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    if (!transaction.closed) {
      await transaction.rollback()
    }

    throw error
  } finally {
    transaction.close()
  }
}

module.exports = {
  db,
  getMany,
  getOne,
  isTransientLibsqlError,
  query,
  run,
  withTransaction
}
