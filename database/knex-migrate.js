#!/usr/bin/env node
// 来自knex-migrate，用于解决knex migratio API和knex-migrate在Windows上打包后
// 仍然使用绝对路径导致找不到文件的问题

const { join } = require('path')
const { existsSync} = require('fs')
const Umzug = require('umzug')
const { omitBy, isNil} = require('lodash')
const Promise = require('bluebird')
const knex = require('knex')
const { promisify } = require('util')
const readdir = promisify(require('fs').readdir)

function normalizeFlags (flags) {
  flags.knexfile = flags.knexfile || 'knexfile.js'

  flags.knexfile = join(__dirname, flags.knexfile)

  flags.env =
    flags.env || process.env.KNEX_ENV || process.env.NODE_ENV || 'development'
}

function knexInit (flags) {
  normalizeFlags(flags)

  let config

  if (flags.config) {
    config = flags.config
  } else {
    try {
      config = require(flags.knexfile)
    } catch (err) {
      if (/Cannot find module/.test(err.message)) {
        console.error(`No knexfile at '${flags.knexfile}'`)
        console.error("Please create one or bootstrap using 'knex init'")
        process.exit(1)
      }

      throw err
    }
  }

  if (config[flags.env] && config[flags.env]) {
    config = config[flags.env]
  }

  if (typeof config !== 'object') {
    console.error(`Malformed knex config:`)
    console.error(JSON.stringify(config, null, 2))
    process.exit(1)
  }

  flags.migrations =
    flags.migrations ||
    (config.migrations && config.migrations.directory) ||
    'migrations'
  flags.migrations = join(__dirname, flags.migrations)

  if (!existsSync(flags.migrations)) {
    console.error(`No migrations directory at '${flags.migrations}'`)
  }

  if (config.client === 'sqlite3') {
    config.useNullAsDefault = true
  }

  config.pool = { max: 10, min: 0, idleTimeoutMillis: 1000 }

  return knex(config)
}

function umzugKnex (flags, connection) {
  return new Umzug({
    storage: join(__dirname, 'storage'),
    storageOptions: { connection },
    migrations: {
      params: [connection, Promise],
      path: flags.migrations,
      pattern: /^\d+_.+\.[j|t]s$/,
      wrap: fn => (knex, Promise) => {
        if (flags.raw) {
          return Promise.resolve(fn(knex, Promise))
        } else {
          return knex.transaction(tx => Promise.resolve(fn(tx, Promise)))
        }
      }
    }
  })
}

async function umzugOptions (command, flags, umzug) {
  if (isNil(flags.to) && isNil(flags.from) && !isNil(flags.only)) {
    return flags.only
  }

  if (flags.to === '0') {
    flags.to = 0
  }

  if (flags.from === '0') {
    flags.from = 0
  }

  const opts = omitBy({ to: flags.to, from: flags.from }, isNil)

  if (!isNil(flags.step)) {
    await applyStepOption(command, umzug, opts, flags.step)
  }

  return opts
}

async function applyStepOption (command, umzug, opts, steps) {
  // Default to 1 step if no number is provided
  if (steps === '') {
    steps = 1
  }

  // Use the list of pending or executed migrations to determine what would happen without --step
  let migrations =
    command === 'up'
      ? await umzug.pending()
      : await umzug.executed().then(m => m.reverse())

  // Remove migrations prior to the one used in --from
  // If it isn't in the list, the --from option has no effect
  if (opts.from) {
    const limit = migrations.find(m => m.file.startsWith(opts.to))
    migrations = migrations.slice(Math.min(0, migrations.indexOf(limit)))
  }

  // Remove migrations after the one used in --to
  // If it isn't in the list, we remove everything, causing a 'migration not pending' notice to show
  if (opts.to) {
    const limit = migrations.find(m => m.file.startsWith(opts.to))
    migrations = migrations.slice(0, migrations.indexOf(limit) + 1)
  }

  // Limit to the number of migrations available
  steps = Math.min(migrations.length, steps)

  // Override the --to option to limit the number of steps taken
  if (steps > 0) {
    opts.to = migrations[steps - 1].file
  }
}

async function knexMigrate (command, flags, progress) {
  flags = flags || {}
  progress = progress || function () {}

  const umzug = umzugKnex(flags, knexInit(flags))

  const debug = action => migration => {
    progress({
      action,
      migration: join(flags.migrations, migration)
    })
  }

  umzug
    .on('migrating', debug('migrate'))
    .on('reverting', debug('revert'))
    .on('debug', debug('debug'))

  const api = {
    up: async () => {
      const opts = await umzugOptions('up', flags, umzug)
      await umzug.storage.ensureTable()
      return umzug.up(opts)
    },
    
    // Non standard, used in this project only
    skipAll: async () => {
      let files  = await readdir(flags.migrations)
      return umzug.storage.skipMigrations(files).catch(err => console.error(err))
    }
  }

  if (!(command in api)) {
    throw new Error('Unknown command: ' + command)
  }

  try {
    return await api[command].apply(null, flags)
  } finally {
    umzug.storage.knex.destroy()
  }
}

module.exports = knexMigrate
module.exports.default = knexMigrate