// This table is from upstream, which is no longer in use
exports.up = async function(knex) {
  await knex.schema.dropTableIfExists('t_favorite');
};

exports.down = async function(knex) {
  let exist = await knex.schema.hasTable('t_favorite');
  if (!exist) {
    await knex.schema.createTable("t_favorite", function(table) {
      table.string('user_name').notNullable();
      table.string('name').notNullable();
      table.text('works').notNullable(); // TEXT 类型 [评价分布明细]
      table.foreign('user_name').references('name').inTable('t_user'); // FOREIGN KEY 外键
      table.primary(['user_name', 'name']); // PRIMARY KEYprimary 主键
    })
  }
};
