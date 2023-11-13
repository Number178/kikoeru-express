exports.up = async function(knex) {
    let exist = await knex.schema.hasTable('t_translate_task')
    if (!exist) {
        await knex.schema.createTable("t_translate_task", function(table) {
            table.timestamps(true, true);
            table.integer('work_id').notNullable().defaultTo(0)
            table.string('audio_path').notNullable().defaultTo("")
            table.integer('status').notNullable().defaultTo(0)
            table.string('worker_name').notNullable().defaultTo("")
            table.string('worker_status').notNullable().defaultTo("")
            table.string('secret').notNullable().defaultTo("")
            table.foreign('work_id').references('id').inTable('t_work');
        })
    }
};

exports.down = async function(knex) {
    await knex.schema.dropTable("t_translate_task");
};
