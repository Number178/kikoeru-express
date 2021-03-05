const { knex } = require('./db');

// 数据库结构
const createSchema = () => knex.schema
  .createTable('t_circle', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [社团id]
    table.string('name').notNullable(); // VARCHAR 类型 [社团名称]
  })
  .createTable('t_work', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [音声id]
    table.string('root_folder').notNullable(); // VARCHAR 类型 [根文件夹别名]
    table.string('dir').notNullable(); // VARCHAR 类型 [相对存储路径]
    table.string('title').notNullable(); // VARCHAR 类型 [音声名称]
    table.integer('circle_id').notNullable(); // INTEGER 类型 [社团id]
    table.boolean('nsfw'); // BOOLEAN 类型
    table.string('release');  // VARCHAR 类型 [贩卖日 (YYYY-MM-DD)]

    table.integer('dl_count'); // INTEGER 类型 [售出数]
    table.integer('price'); // INTEGER 类型 [价格]
    table.integer('review_count'); // INTEGER 类型 [评论数量]
    table.integer('rate_count'); // INTEGER 类型 [评价数量]
    table.float('rate_average_2dp'); // FLOAT 类型 [平均评价]
    table.text('rate_count_detail'); // TEXT 类型 [评价分布明细]
    table.text('rank'); // TEXT 类型 [历史销售业绩]
    
    table.foreign('circle_id').references('id').inTable('t_circle'); // FOREIGN KEY 外键
    table.index(['circle_id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp'], 't_work_index'); // INDEX 索引
  })
  .createTable('t_tag', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [标签id]
    table.string('name').notNullable(); // VARCHAR 类型 [标签名称]
  })
  .createTable('t_va', (table) => {
    table.string('id'); // UUID v5, 基于name生成的固定值
    table.string('name').notNullable(); // VARCHAR 类型 [声优名称]
    table.primary('id');
  })
  .createTable('r_tag_work', (table) => {
    table.integer('tag_id');
    table.integer('work_id');
    table.foreign('tag_id').references('id').inTable('t_tag'); // FOREIGN KEY 外键
    table.foreign('work_id').references('id').inTable('t_work'); // FOREIGN KEY 外键
    table.primary(['tag_id', 'work_id']); // PRIMARY KEYprimary 主键
  })
  .createTable('r_va_work', (table) => {
    table.string('va_id');
    table.integer('work_id');
    table.foreign('va_id').references('id').inTable('t_va').onUpdate('CASCADE').onDelete('CASCADE'); // FOREIGN KEY 外键
    table.foreign('work_id').references('id').inTable('t_work').onUpdate('CASCADE').onDelete('CASCADE'); // FOREIGN KEY 外键
    table.primary(['va_id', 'work_id']); // PRIMARY KEYprimary 主键
  })
  .createTable('t_user', (table) => {
    table.string('name').notNullable();
    table.string('password').notNullable();
    table.string('group').notNullable(); // USER ADMIN guest
    table.primary(['name']); // PRIMARY KEYprimary 主键
  })
  .createTable('t_review', (table) => {
    table.string('user_name').notNullable();
    table.string('work_id').notNullable();
    table.integer('rating'); // 用户评分1-5
    table.string('review_text'); // 用户评价文字
    table.timestamps(true, true); // 时间戳created_at, updated_at
    table.string('progress'); // ['marked', 'listening', 'listened', 'postponed', null]
    table.foreign('user_name').references('name').inTable('t_user').onDelete('CASCADE'); // FOREIGN KEY 
    table.foreign('work_id').references('id').inTable('t_work').onDelete('CASCADE'); // FOREIGN KEY 
    table.primary(['user_name', 'work_id']); // PRIMARY KEY
  })
  .raw(
    // TODO: Refactor this to something more readable so that others can cooperate
    // TODO: Break into multiple steps, use Javascript rather than json_group_array
    `CREATE VIEW IF NOT EXISTS userMetadata AS
      SELECT t_work.id,
        t_work.title,
        json_object('id', t_work.circle_id, 'name', t_circle.name) AS circleObj,
        t_work.release,
        t_work.review_count,
        t_work.dl_count,
        t_work.nsfw,
        userrate.userRating,
        userrate.review_text,
        userrate.progress,
        userrate.updated_at,
        json_object('vas', json_group_array(json_object('id', t_va.id, 'name', t_va.name))) AS vaObj,
        userrate.user_name
      FROM t_work
      JOIN t_circle on t_circle.id = t_work.circle_id
      JOIN r_va_work on r_va_work.work_id = t_work.id
      join t_va on t_va.id = r_va_work.va_id
      JOIN (
          SELECT t_review.work_id,
            t_review.rating AS userRating,
            t_review.review_text,
            t_review.progress,
            strftime('%Y-%m-%d %H-%M-%S', t_review.updated_at, 'localtime') AS updated_at,
            t_review.user_name
          FROM t_review
            JOIN t_work on t_work.id = t_review.work_id
          ) AS userrate
      ON userrate.work_id = t_work.id
      GROUP BY t_work.id, userrate.user_name
    `
  )
  .then(() => {
    console.log(' * 成功构建数据库结构.');
  })
  .catch((err) => {
    if (err.toString().indexOf('table `t_circle` already exists') !== -1) {
      console.log(' * 数据库结构已经存在.');
    } else {
      throw err;
    }
  });

module.exports = { createSchema };
