// Purpose: change t_va(id) to store string UUID instead of old hash integer
// See GitHub issue #22
exports.up = async function(knex) {
  // Note: SQLite disables foreign keys by default.
  // I did not set PRAGMA foreign_keys=on in afterCreate()
  // this up() function is wrapped inside a transaction, and SQLite does not support changing PRAGMA in transactions.
  try {
      // Will be recreated by the main program
    await knex.raw('DROP VIEW IF EXISTS userMetadata;');
    // Change t_va(id) data type to TEXT
    // SQLite has very limited support for alter table
    await knex.raw(`
      CREATE TABLE t_va_new (
        id	TEXT,
        name	TEXT NOT NULL,
        PRIMARY KEY(id)
      );
    `);
    await knex.raw('INSERT INTO t_va_new SELECT * FROM t_va;');
    await knex.raw('DROP TABLE t_va;');
    await knex.raw('ALTER TABLE t_va_new RENAME TO t_va;');

    // Change r_va_work(id) data type to TEXT
    // SQLite has very limited support for alter table
    await knex.raw(`
      CREATE TABLE r_va_work_new (
        va_id TEXT,
        work_id INTEGER,
        FOREIGN KEY(va_id) REFERENCES t_va(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(work_id) REFERENCES t_work(id) ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY(va_id, work_id)
      );
    `);
    await knex.raw('INSERT INTO r_va_work_new(va_id, work_id) SELECT va_id, work_id FROM r_va_work;');
    await knex.raw('DROP TABLE r_va_work;');
    await knex.raw('ALTER TABLE r_va_work_new RENAME TO r_va_work;');
  } catch(err) {
    console.error(err);
    throw err;
  }
};

exports.down = async function(knex) {
  try {
      // Will be recreated by the main program
    await knex.raw('DROP VIEW IF EXISTS userMetadata;');
    // Change t_va(id) data type to TEXT
    // SQLite has very limited support for alter table
    await knex.raw(`
      CREATE TABLE t_va_new (
        id	INTEGER,
        name	TEXT NOT NULL,
        PRIMARY KEY(id)
      );
    `);
    await knex.raw('INSERT INTO t_va_new SELECT * FROM t_va;');
    await knex.raw('DROP TABLE t_va;');
    await knex.raw('ALTER TABLE t_va_new RENAME TO t_va;');

    // Change r_va_work(id) data type to TEXT
    // SQLite has very limited support for alter table
    await knex.raw(`
      CREATE TABLE r_va_work_new (
        va_id INTEGER,
        work_id INTEGER,
        FOREIGN KEY(va_id) REFERENCES t_va(id),
        FOREIGN KEY(work_id) REFERENCES t_work(id),
        PRIMARY KEY(va_id, work_id)
      );
    `);
    await knex.raw('INSERT INTO r_va_work_new(va_id, work_id) SELECT va_id, work_id FROM r_va_work;');
    await knex.raw('DROP TABLE r_va_work;');
    await knex.raw('ALTER TABLE r_va_work_new RENAME TO r_va_work;');
  } catch(err) {
    console.error(err);
    throw err;
  }
};
