const { knex } = require('./db');

const dbVersion = '20210502081522';

// 数据库结构
const createSchema = () => knex.schema
  .createTable('t_circle', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [社团id]
    table.string('name').notNullable(); // VARCHAR 类型 [社团名称]
  })
  .createTable('t_work', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [音声id]
    table.timestamps(true, true); // 时间戳created_at, updated_at
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
    table.string('lyric_status').notNullable(); // TEXT 类型 [歌词状态] , "" "local" "ai" "local ai"
    
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
    table.string('progress'); // ['marked', 'listening', 'listened', 'replay'，'postponed', null]
    table.foreign('user_name').references('name').inTable('t_user').onDelete('CASCADE'); // FOREIGN KEY 
    table.foreign('work_id').references('id').inTable('t_work').onDelete('CASCADE'); // FOREIGN KEY 
    table.primary(['user_name', 'work_id']); // PRIMARY KEY
  })
  .createTable('t_play_histroy', (table) => {
    table.string('user_name').notNullable();
    table.integer('work_id').notNullable();
    table.timestamps(true, true); // 时间戳created_at, updated_at
    table.string('state').notNullable(); // 播放状态，一个json字符串，从前端村粗的状态，记录了当前播放的队列文件、播放序号、播放时间等

    table.foreign('user_name').references('name').inTable('t_user').onDelete('CASCADE'); // FOREIGN KEY 
    table.foreign('work_id').references('id').inTable('t_work').onDelete('CASCADE'); // FOREIGN KEY 外键

    table.primary(['user_name', 'work_id']); // PRIMARY KEY
  })
  .createTable('t_translate_task', (table) => {
    table.increments(); // id自增列(INTEGER 类型)，会被用作主键
    // 翻译任务列表，为方便，本函数内task均指代翻译task
    // 所以被增加的翻译任务列表，以音频文件为单位进行记录
    // 以下称呼宿主kikoeru环境为host，翻译任务执行所在的服务器为worker
    table.timestamps(true, true); // 时间戳created_at, updated_at
    table.integer('work_id').notNullable().defaultTo(0) // 该音频对应的作品id
    table.string('audio_path').notNullable().defaultTo("") // 音频文件的相对路径，一个音频文件的完整路径是：/ root_folder / work.dir / audio_path
    table.integer('status').notNullable().defaultTo(0) // host翻译任务的状态，0非法状态、1任务已记录尚未被认领执行、2认领成功翻译中、3成功、4失败

    // 认领执行该任务的worker名称，每一个worker应当用不同的名称来标识自己，方便kikoeru分辨音频翻译任务正在由谁执行
    // 尚未被认领时，此字段为空串
    table.string('worker_name').notNullable().defaultTo("")
    table.string('worker_status').notNullable().defaultTo("") // worker认领任务成功后，通过这个字段向kikoeru更新翻译进度和状态

    // 认领任务后，host将会生成一段随机hash值作为密码，传递给worker记录，
    // worker更新翻译状态需要上传匹配密码，避免同一个task被其他worker给扰乱状态
    // 同时secret也可以作为重新分配worker的一种机制，重新分配worker时更新secret防止旧的worker错误地更新状态
    table.string('secret').notNullable().defaultTo("")

    // 当worker成功翻译音频后，task任务status才会被设置为成功状态，同时可下载翻译歌词
    // 翻译歌词以 `${t_translate_task.work_id}_${t_translate_task.id}.lrc` 的形式存储在host的歌词文件夹内，
    // 该文件夹的路径为: config.lyricFolderDir

    table.foreign('work_id').references('id').inTable('t_work'); // FOREIGN KEY 外键

    // task.status = 0 // 非法状态
    //    |
    //    |
    //    V
    //  status = 1 // 任务已记录，添加到数据库中，待worker认领执行
    //    |
    //    |  woker认领
    //    V
    // status = 2 // 已认领、翻译中
    //    |            |
    //    |            |___________服务器翻译中
    //    |            |          |
    //    |重分配       |          |
    //    |worker      V          V
    //    |          (3 成功)   (4 失败)
    //    |            |          |
    //    |            V          V
    //    |-----------------------`
    //    |
    //    | 重新翻译
    //    |
    //    V
    //  status = 1 // status 2/3/4 状态均可被kikoeru服务器给重置到 status 1，重新进行翻译
    //    
  })
  .raw(`
    CREATE VIEW IF NOT EXISTS staticMetadata AS
    SELECT baseQueryWithVA.*,
      json_object('tags', json_group_array(json_object('id', t_tag.id, 'name', t_tag.name))) AS tagObj
    FROM (
      SELECT baseQuery.*,
        json_object('vas', json_group_array(json_object('id', t_va.id, 'name', t_va.name))) AS vaObj
      FROM (
        SELECT t_work.id, 
          t_work.created_at,
          t_work.updated_at,
          t_work.title,
          t_work.circle_id,
          t_circle.name,
          json_object('id', t_work.circle_id, 'name', t_circle.name) AS circleObj,
          t_work.nsfw,
          t_work.release,
          t_work.dl_count,
          t_work.price,
          t_work.review_count,
          t_work.rate_count,
          t_work.rate_average_2dp,
          t_work.rate_count_detail,
          t_work.rank,
          t_work.lyric_status
        FROM t_work
        JOIN t_circle ON t_circle.id = t_work.circle_id
      ) AS baseQuery
      JOIN r_va_work ON r_va_work.work_id = baseQuery.id
      JOIN t_va ON t_va.id = r_va_work.va_id
      GROUP BY baseQuery.id
    ) AS baseQueryWithVA
    LEFT JOIN r_tag_work ON r_tag_work.work_id = baseQueryWithVA.id
    LEFT JOIN t_tag ON t_tag.id = r_tag_work.tag_id
    GROUP BY baseQueryWithVA.id;
  `)
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

module.exports = { createSchema, dbVersion };
