// 来自knex-migrate，用于解决knex migratio API和knex-migrate在Windows上打包后
// 仍然使用绝对路径导致找不到文件的问题

const invariant = require('invariant')
const { get } = require('lodash')

function tableDoesNotExist (err, table) {
  return (
    err.code === 'ER_NO_SUCH_TABLE' ||
    new RegExp(`relation "${table}" does not exist`).test(err.message) ||
    new RegExp(`no such table: ${table}`).test(err.message)
  )
}

module.exports = class KnexStorage {
  constructor (options) {
    this.knex = options.connection
    this.tableName = get(
      this.knex,
      'client.config.migrations.tableName',
      'knex_migrations'
    )
    invariant(
      this.knex,
      "The option 'options.storageOptions.connection' is required."
    )
  }

  ensureTable () {
    return this.knex(this.tableName)
      .count('id')
      .catch(err => {
        if (tableDoesNotExist(err, this.tableName)) {
          return this.knex.schema.createTable(this.tableName, table => {
            table.increments()
            table.string('name')
            table.integer('batch')
            table.dateTime('migration_time')
          })
        }

        throw err
      })
  }

  async logMigration (migrationName) {
    if (typeof this.currentBatch === 'undefined') {
      this.currentBatch = this.getCurrentBatch()
    }

    const currentBatch = await this.currentBatch

    return this.knex(this.tableName).insert({
      name: migrationName,
      batch: currentBatch + 1,
      migration_time: new Date() // eslint-disable-line camelcase
    })
  }

  // Non standard
  async skipMigrations (migrationNames) {
    await this.ensureTable ()

    const currentBatch = await this.getCurrentBatch()

    let records = []
    migrationNames.forEach((fileName) => {
      records.push({name: fileName, batch: currentBatch + 1, migration_time: new Date()})
    });
    return this.knex(this.tableName).insert(records)
  }

  unlogMigration (migrationName) {
    return this.knex(this.tableName)
      .where('name', migrationName)
      .del()
  }

  migrations () {
    return this.knex(this.tableName)
      .select()
      .orderBy('id', 'asc')
  }

  executed () {
    return this.knex(this.tableName)
      .orderBy('id', 'asc')
      .pluck('name')
      .catch(err => {
        if (tableDoesNotExist(err, this.tableName)) {
          return []
        }

        throw err
      })
  }

  getCurrentBatch () {
    return this.knex(this.tableName)
      .max('batch as max_batch')
      .then(obj => obj[0].max_batch || 0)
  }
}