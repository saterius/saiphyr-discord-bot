const db = require("./client")

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
  return executor.execute({ sql, args })
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
  query,
  run,
  withTransaction
}
