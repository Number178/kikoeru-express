exports.up = async function(knex) {
  await knex.schema.hasTable('t_review')
    .then((tableexist) => {
      if (!tableexist) {
        knex.schema.createTable("t_review", function(table) {
          table.string('user_name').notNullable();
          table.string('work_id').notNullable();
          table.integer('rating'); // 用户评分1-5
          table.string('review_text'); // 用户评价文字
          table.timestamps(true, true); // 时间戳created_at, updated_at 默认当前时间
          table.foreign('user_name').references('name').inTable('t_user'); // FOREIGN KEY 
          table.foreign('work_id').references('id').inTable('t_work'); // FOREIGN KEY 
          table.primary(['user_name', 'work_id']); // PRIMARY KEY
        }).catch((err) => console.error(err));
      }
    }).catch((err) => console.error(err));
};

exports.down = async function(knex) {
  await knex.schema.dropTable("t_review").catch(err => console.error(err));
};
