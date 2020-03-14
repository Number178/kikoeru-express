const { knex } = require('./db');

// 数据库结构
const createSchema = () => knex.schema
  .createTable('t_circle', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [社团id]
    table.string('name').notNullable(); // VARCHAR 类型 [社团名称]
  })
  .createTable('t_work', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [作品id]
    table.string('dir').notNullable(); // VARCHAR 类型 [相对存储路径]
    table.string('title').notNullable(); // VARCHAR 类型 [作品名称]
    table.integer('circle_id').notNullable(); // INTEGER 类型 [社团id]
    table.boolean('nsfw').notNullable(); // BOOLEAN 类型
    table.foreign('circle_id').references('id').inTable('t_circle'); // FOREIGN KEY 外键
  })
  .createTable('t_tag', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [标签id]
    table.string('name').notNullable(); // VARCHAR 类型 [标签名称]
  })
  .createTable('t_va', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [声优id]
    table.string('name').notNullable(); // VARCHAR 类型 [声优名称]
  })
  .createTable('r_tag_work', (table) => {
    table.integer('tag_id');
    table.integer('work_id');
    table.foreign('tag_id').references('id').inTable('t_tag'); // FOREIGN KEY 外键
    table.foreign('work_id').references('id').inTable('t_work'); // FOREIGN KEY 外键
    table.primary(['tag_id', 'work_id']); // PRIMARY KEYprimary 主键
  })
  .createTable('r_va_work', (table) => {
    table.integer('va_id');
    table.integer('work_id');
    table.foreign('va_id').references('id').inTable('t_va'); // FOREIGN KEY 外键
    table.foreign('work_id').references('id').inTable('t_work'); // FOREIGN KEY 外键
    table.primary(['va_id', 'work_id']); // PRIMARY KEYprimary 主键
  })
  .then(() => {
    console.log(' * Schema created.');
  })
  .catch((err) => {
    if (err.toString().indexOf('table `t_circle` already exists') !== -1) {
      console.log(' * Schema already exists.');
    } else {
      throw new Error(` ! ERROR while creating schema: ${err}`);
    }
  });


module.exports = { createSchema };
