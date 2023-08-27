exports.up = async function(knex) {
    let exist = await knex.schema.hasTable('t_play_histroy')
    if (!exist) {
        await knex.schema.createTable("t_play_histroy", function(table) {
            table.string('user_name').notNullable();
            table.integer('work_id').notNullable();
            table.timestamps(true, true); // 时间戳created_at, updated_at
            table.string('state').notNullable(); // 播放文件相对路径，相对于worker本身的文件夹
        
            table.foreign('user_name').references('name').inTable('t_user').onDelete('CASCADE'); // FOREIGN KEY 
            table.foreign('work_id').references('id').inTable('t_work').onDelete('CASCADE'); // FOREIGN KEY 外键
        
            table.primary(['user_name', 'work_id']); // PRIMARY KEY
        })
    }
};

exports.down = async function(knex) {
    await knex.schema.dropTable("t_play_histroy");
};
