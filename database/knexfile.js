// Update with your config settings.

module.exports = {
  client: 'sqlite3',
  connection: {
    // 路径是相对于调用本文件的app.js
    // 如果使用knex-migrate，需要修改为../sqlite/db.sqlite3
    // 或手动指定
    filename: './sqlite/db.sqlite3' 
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
