const path = require('path')
const { config } = require('../config')

module.exports = {
  // Default environment
  development: {
    client: 'sqlite3', // 数据库类型
    useNullAsDefault: true,
    connection: { // 连接参数
      filename: path.join(config.databaseFolderDir, 'db.sqlite3'),
    },
    acquireConnectionTimeout: 40000, // 连接计时器
    pool: {
      afterCreate: (conn, done) => {
        conn.run('PRAGMA foreign_keys = ON;', function (err) {
          if (err) {
            done(err, conn);
          } else {
            conn.run(`PRAGMA busy_timeout = ${config.dbBusyTimeout};`, function (err) {
              done(err, conn);
            });
          }
        });
      }
    }
  },

  // For migration only. Foreign keys are disabled (SQLite default)
  upgrade: {
    client: 'sqlite3',
    connection: {
      filename: path.join(config.databaseFolderDir, 'db.sqlite3')
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  test: {
    client: "sqlite3",
    connection: {
      filename: path.join(__dirname, '../test/db-test.sqlite3'),
    },
    useNullAsDefault: true,
    migrations: {
      tableName: 'knex_migrations'
    }
  }
};
