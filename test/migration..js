/* eslint-disable node/no-unpublished-require */
// This test checks whether migration from 0.3.0 works
// There is no easy way to check verify that the schema after the migration is the same as the one created from scratch by createSchema()
// Every time when I finish checking the schema I set dbVersion in schema.js to the number in the latest migration file

// Prevent writing config files (side effect of config.js)
process.env.FREEZE_CONFIG_FILE = true;
process.env.NODE_ENV='test';

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-string'));
const { unlink } = require('fs');
const { join } = require('path');

const db = require('../database/db').knex;

const knexMigrate = require('../database/knex-migrate');
const { dbVersion } = require('../database/schema');

describe('Database', function() {
  before('Spin up v0.3.0 database schema', async function() {
    const { createOldSchema } = require('./spinup/spinup-0.3.0');
    await createOldSchema();
  })

  it('v0.3.0 should work', async function() {
    const result = await db.raw(`pragma table_info('t_va')`);
    // t_va id column type was integer in 0.3.0
    expect(result[0]['type']).to.equal('integer');
  })

  it('should be able to migrate to latest', async function() {
    const log = ({ action, migration }) => console.log('Doing ' + action + ' on ' + migration);
    await knexMigrate('up', {}, log);
  })

  it('schema after migration', async function() {
    // There is no easy way to verify that the schema after the migration is the same as the one created from scratch by createSchema()
    // There were some mistakes in previous migrations causing inconsistencies like 'text' vs 'varchar(255)'
    // Most inconsistencies do not cause bugs, because of SQLite type affinity. For example, SQLite stores all string types in 'text' and ignores the 255 limit.
    // You will have to read and verify manually
    // const schema = await db.raw('select sql from sqlite_master where sql not NULL');
    // console.log(schema);

    const tableNames = (await db.raw(`SELECT name FROM sqlite_master WHERE type ='table' AND name NOT LIKE 'sqlite_%'`)).map(record => record['name']);
    console.log(tableNames)

    for (const table of tableNames) {
      console.log(table)
      const tableInfo = await db.raw(`pragma table_info(${table})`);
      console.table(tableInfo);
    }

    // Every time when I finish checking the schema I set dbVersion in schema.js to the number in the last migration file
    // e.g. '20210307061415'
    // I use this test to prevent me from making mistakes
    // If you want to fork this code and don't understand how this works, just comment out the following lines
    const lastMigration = await db.raw('select name from knex_migrations order by id desc limit 1');
    expect(dbVersion).to.be.a('string');
    expect(lastMigration[0].name).to.startsWith(dbVersion);
  })

  after('Tear down test database', async function() {
    const { dropDatabase } = require('./teardown/teardown-0.6.0');
    await dropDatabase();
  })
})

describe('Database v0.6.0-rc4', function() {
  before('Spin up v0.6.0-rc4 database schema', async function() {
    const { createOldSchema } = require('./spinup/spinup-0.6.0-rc4');
    await createOldSchema();
    await knexMigrate('skipAll', {to: '20210213233544_fill_va_uuid'});
  })

  it('should work', async function() {
    const result = await db.raw(`pragma table_info('t_va')`);
    // t_va id column type has changed to text in v0.6.0-rc4
    expect(result[0]['type']).to.equal('varchar(255)');
  })

  it('should be able to migrate to 20210502081522_remove_obsolete_view', async function() {
    const log = ({ action, migration }) => console.log('Doing ' + action + ' on ' + migration);
    await knexMigrate('up', { to: '20210502081522' }, log);
  })

  it('should have null constraints removed', async function() {
    const tableInfo = await db.raw(`pragma table_info('t_work')`);
    console.table(tableInfo);
    for (const field of tableInfo) {
      if (field['name'] === 'dl_count') {
        expect(field['notnull']).to.equal(0);
      }
    }
  })

  after('Delete test database', function(done) {
    db.destroy(() => {
      unlink(join(__dirname, 'db-test.sqlite3'), (err) => {
        if (err) throw err;
      });
      done();
    });
  })
})