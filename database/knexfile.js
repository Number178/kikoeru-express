const path = require('path')
const { config } = require('../config')

module.exports = {
  client: 'sqlite3',
  connection: {
    filename: path.join(config.databaseFolderDir, 'db.sqlite3')
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
