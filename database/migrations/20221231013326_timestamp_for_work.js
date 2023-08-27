
exports.up = async function(knex) {
  await knex.schema.alterTable('t_work', function(table) {
    table.timestamps(true, true); // 时间戳created_at, updated_at 默认当前时间
  });
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

exports.down = async function(knex) {
  table.dropColumn('updated_at'); // drop column
  table.dropColumn('created_at'); // drop column
};
