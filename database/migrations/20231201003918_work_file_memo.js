exports.up = async function(knex) {
    await knex.schema.alterTable('t_work', function(table) {
       table.json('memo');
    });
    await knex.raw("UPDATE t_work SET memo = '{}';")
  };
  
  exports.down = async function(knex) {
    await knex.schema.alterTable('t_work', function(table) {
      table.dropColumn('memo');
    });
  };
  