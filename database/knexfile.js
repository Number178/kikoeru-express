// Update with your config settings.

module.exports = {
  client: 'sqlite3',
  connection: {
    filename: './sqlite/db.sqlite3'
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
