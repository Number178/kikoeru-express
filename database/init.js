const fs = require('fs');
const { md5 } = require('../auth/utils');
const knexMigrate = require('./knex-migrate');
const { databaseExist, createUser } = require('./db');
const pjson = require('../package.json');
const compareVersions = require('compare-versions');
const { config, updateConfig } = require('../config');
const { applyFix } = require('../upgrade');
const { createSchema } = require('./schema');

const initApp = async () => {
  let configVersion = config.version;
  let currentVersion = pjson.version;

  
  async function runMigrations () {
    const log = ({ action, migration }) => console.log('Doing ' + action + ' on ' + migration);
    await knexMigrate('up', {}, log);
  }

  async function skipMigrations () {
    await knexMigrate('skipAll', {});
  }

  // Fix a nasty bug introduced in v0.5.1
  async function fixMigrations () {
    if (compareVersions.compare(configVersion, 'v0.5.1', '>=') && compareVersions.compare(configVersion, 'v0.5.3', '<')) {
      await knexMigrate('skipAll', {to: '20210108093032'});
    }
  }

  function initDatabaseDir () {
    const databaseFolderDir = config.databaseFolderDir;
    if (!fs.existsSync(databaseFolderDir)) {
      try {
        fs.mkdirSync(databaseFolderDir, { recursive: true });
      } catch(err) {
        console.error(` ! 在创建存放数据库文件的文件夹时出错: ${err.message}`);
      }
    }
  }

  // 迁移或创建数据库结构
  if (databaseExist && compareVersions.compare(currentVersion, configVersion, '>')) {
    console.log('升级中');
    const oldVersion = config.version;
    try {
      await applyFix(oldVersion);
      await fixMigrations();
      await runMigrations();
      updateConfig();
    } catch (error) {
      console.log('升级迁移过程中出错，请在GitHub issues中报告作者')
      console.error(error);
    }
  } else if (!databaseExist) {
    initDatabaseDir();
    await createSchema();
    try { // 创建内置的管理员账号
      await createUser({
        name: 'admin',
        password: md5('admin'),
        group: 'administrator'
      });
    } catch(err) {{
        console.error(err.message);
        process.exit(1);
      }
    }
    try {
      await skipMigrations()
    } catch (err) {
      console.error(` ! 在构建数据库结构过程中出错: ${err.message}`);
      process.exit(1);
    }
    if (compareVersions.compare(currentVersion, configVersion, '>')) {
      // Update config only. Do not apply fix to database.
      updateConfig();
    }
  }
}

module.exports = { initApp };
