exports.up = async function(knex) {
  await knex.schema.alterTable('t_review', function(table) {
    table.string('progress'); // add column ['wish', 'listened', 'abandoned', null]
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('t_review', function(table) {
    table.dropColumn('progress'); // drop column progress
  });
};
