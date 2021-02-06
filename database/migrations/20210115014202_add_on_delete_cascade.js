exports.up = async function(knex) {

  await knex.raw(`PRAGMA foreign_keys=off;`);

  await knex.transaction(async (trx) => {
    // Add on delete cascade
    // SQLite allows DDL in transaction
    await trx.raw(`
      CREATE TABLE "t_review_new" (
        "user_name"	varchar(255) NOT NULL,
        "work_id"	varchar(255) NOT NULL,
        "rating"	integer,
        "review_text"	varchar(255),
        "created_at"	datetime DEFAULT CURRENT_TIMESTAMP,
        "updated_at"	datetime DEFAULT CURRENT_TIMESTAMP,
        "progress"	varchar(255),
        PRIMARY KEY("user_name","work_id"),
        FOREIGN KEY("work_id") REFERENCES "t_work"("id") ON DELETE CASCADE,
        FOREIGN KEY("user_name") REFERENCES "t_user"("name") ON DELETE CASCADE
      );
    `);
    await trx.raw(`INSERT INTO t_review_new SELECT * FROM t_review;`);
    await trx.raw(`DROP TABLE t_review;`);
    // Will be recreated by the main program
    await trx.raw(`DROP VIEW IF EXISTS userMetadata;`);
    await trx.raw(`ALTER TABLE t_review_new RENAME TO t_review;`);
  }).catch(err => console.error(err));

  await knex.raw(`PRAGMA foreign_keys=on;`);
};

exports.down = async function(knex) {
  await knex.raw(`PRAGMA foreign_keys=off;`);

  await knex.transaction(async (trx) => {
    await trx.raw(`
      CREATE TABLE "t_review_new" (
        "user_name"	varchar(255) NOT NULL,
        "work_id"	varchar(255) NOT NULL,
        "rating"	integer,
        "review_text"	varchar(255),
        "created_at"	datetime,
        "updated_at"	datetime,
        "progress"	varchar(255),
        PRIMARY KEY("user_name","work_id"),
        FOREIGN KEY("work_id") REFERENCES "t_work"("id"),
        FOREIGN KEY("user_name") REFERENCES "t_user"("name")
      );
    `);
    await trx.raw(`INSERT INTO t_review_new SELECT * FROM t_review;`);
    await trx.raw(`DROP TABLE t_review;`);
    // Will be recreated by the main program
    await trx.raw(`DROP VIEW IF EXISTS userMetadata;`);
    await trx.raw(`ALTER TABLE t_review_new RENAME TO t_review;`);
  }).catch(err => console.error(err));

  await knex.raw(`PRAGMA foreign_keys=on;`);
};
