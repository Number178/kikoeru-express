参考：
* https://github.com/sheerun/knex-migrate
* https://github.com/kikoeru-project/kikoeru-express/wiki/%E6%95%B0%E6%8D%AE%E5%BA%93

```
cd database/
npx knex-migrate list # 列出所有的migration
npx knex-migrate name_for_migration # 创建migration
npx knex-migrate up # 向上迁移到最近改动
npx knex-migrate down # 向下迁移一个改动
```


数据库cli操作
```
sqlite3 ./db/db.sqlite3
```

在sql命令行中操作
```
.quit # 退出
.tables # 显示所有数据表
.schema # 现实所有表的结构
.schema tableName # 现实tableName这个表的结构

select * from knex_migrations # 展示已经应用的migrations
```

# 典型的migration操作语句
```
exports.up = async function(knex) {
  await knex.schema.alterTable('t_work', function(table) {
     table.string('lyric_status');
  });

  await knex.raw("UPDATE t_work SET lyric_status = '';")
  await knex.raw("DROP VIEW IF EXISTS staticMetadata;")

  await knex.raw(`
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
  `);
};

exports.down = async function(knex) {
  await knex.schema.alterTable('t_work', function(table) {
    table.dropColumn('lyric_status'); // drop column progress
  });

  await knex.raw("DROP VIEW IF EXISTS staticMetadata;")

  await knex.raw(`
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
          t_work.rank
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
  `);
};

```