const Writer = require('./../../defaults/writer')
const logger = require('./../../pino')
const { Client } = require('pg')
const { retry } = require('@lifeomic/attempt')
const get = require('lodash/get')
const moment = require('moment-timezone')

/*
configuration: {
  connection: "conn",
  table:      "",
  fields:     {}
}
*/

class Postgres extends Writer {
  async open () {
    let db = await retry(async () => {
      return this._connect(this.config.connection)
    }, { maxAttempts: 5, timeout: 36000 })
    this.db = db

    let schema = await this._createTableSchema(this.config.fields)

    await this._dropTable(db, this.config.table)
    await this._createTable(db, this.config.table, schema)
  }

  async _connect (connection) {
    let db = new Client({ connectionString: connection })
    await db.connect()
      .catch(logger.warn)
    return db
  }

  async _createTableSchema (fields) {
    let schema = []
    Object.keys(fields).forEach(name => {
      let field = fields[name]
      let datatype = get(field, 'datatype', 'TEXT').toUpperCase()
      let isPrimary = (get(field, 'primary', false) === true) ? 'PRIMARY KEY' : '' 

      schema.push([name, datatype, isPrimary].join(' ').trimRight())
    })
    return schema
  }

  async _dropTable (db, table) {
    logger.info(`Dropping table ${table}`)
    return db.query(`DROP TABLE IF EXISTS ${table}`)
      .catch(logger.error)
  }

  async _createTable (db, table, schema) {
    logger.info(`Creating table ${table}`)
    return db.query(`CREATE TABLE IF NOT EXISTS ${table} (${schema.join(', ')})`)
      .catch(logger.error)
  }

  async items (items, configuration) {
    let config = { ...this.config, ...configuration }
    let inserts = items.map(async item => this._item(item, config.fields, config.table, this.db))
    return Promise.all(inserts)
  }

  async _item (item, fields, table, db) {
    let query = this._insertQuery(item, fields, table)
    await db.query(query)
      .catch(err => {
        logger.error({ error: err.error, query: query, hint: err.hint })
      })
  }

  _insertQuery (item, fields, table) {
    let formattedKeys = []
    let formattedData = []
    Object.keys(item).forEach(name => {
      let value
      let datatype = get(fields[name], 'datatype', 'text').toLowerCase()

      if (['integer', 'real'].includes(datatype)) {
        value = item[name] 
      } else if (['timestamptz'].includes(datatype)) { 
        value = "'" + moment(item[name]).tz('America/Los_Angeles').format() + "'" 
      } else if (['boolean'].includes(datatype)) { 
        value = (String(item[name]).toLowerCase() === 'true') 
      } else { 
        this._escapeString(item[name]) 
      }
      
      formattedKeys.push(item[name])
      formattedData.push(value)
    })

    let query = `INSERT INTO ${table} (${formattedKeys.join(', ')}) VALUES (${formattedData.join(', ')})`
    return query
  }

  _escapeString (input) {
    let value = String(input)
    var backslash = ~value.indexOf('\\')
    var prefix = backslash ? 'E' : ''
    value = value.replace(/'/g, "''").replace(/\\/g, '\\\\')
    value = prefix + "'" + value + "'"
    return value
  }

  async close () {
    await this.db.end()
    delete this.db
  }
}

module.exports = Postgres