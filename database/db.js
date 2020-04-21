const fs = require('fs');
const path = require('path');

const { getConfig } = require('../config');
const config = getConfig();

const databaseFolderDir = config.databaseFolderDir;
if (!fs.existsSync(databaseFolderDir)) {
  try {
    fs.mkdirSync(databaseFolderDir, { recursive: true });
  } catch(err) {
    console.error(` ! 在创建存放数据库文件的文件夹时出错: ${err.message}`);
  }
}

// knex 操作数据库
const knex = require('knex')({
  client: 'sqlite3', // 数据库类型
  useNullAsDefault: true,
  connection: { // 连接参数
    filename: path.join(databaseFolderDir, 'db.sqlite3'),
  },
  acquireConnectionTimeout: 5000, // 连接计时器
});

/**
 * Takes a work metadata object and inserts it into the database.
 * @param {Object} work Work object.
 */
// Using trx as a query builder:
const insertWorkMetadata = work => knex.transaction(trx => trx.raw(
  trx('t_circle')
    .insert({
      id: work.circle.id,
      name: work.circle.name,
    }).toString().replace('insert', 'insert or ignore'),
)
  .then(() => trx('t_work')
    .insert({
      id: work.id,
      root_folder: work.rootFolderName,
      dir: work.dir,
      title: work.title,
      circle_id: work.circle.id,
      nsfw: work.nsfw,
      release: work.release,

      dl_count: work.dl_count,
      price: work.price,
      review_count: work.review_count,
      rate_count: work.rate_count,
      rate_average_2dp: work.rate_average_2dp,
      rate_count_detail: JSON.stringify(work.rate_count_detail),
      rank: work.rank ? JSON.stringify(work.rank) : null
    }))
  .then(() => {
    // Now that work is in the database, insert relationships
    const promises = [];

    for (let i = 0; i < work.tags.length; i += 1) {
      promises.push(trx.raw(
        trx('t_tag')
          .insert({
            id: work.tags[i].id,
            name: work.tags[i].name,
          }).toString().replace('insert', 'insert or ignore'),
      )
        .then(() => trx('r_tag_work')
          .insert({
            tag_id: work.tags[i].id,
            work_id: work.id,
          })));
    }

    for (let i = 0; i < work.vas.length; i += 1) {
      promises.push(trx.raw(
        trx('t_va')
          .insert({
            id: work.vas[i].id,
            name: work.vas[i].name,
          }).toString().replace('insert', 'insert or ignore'),
      )
        .then(() => trx('r_va_work')
          .insert({
            va_id: work.vas[i].id,
            work_id: work.id,
          })));
    }

    return Promise.all(promises)
      .then(() => trx);
  }));

/**
 * 更新音声的动态元数据
 * @param {Object} work Work object.
 */
const updateWorkMetadata = work => knex.transaction(trx => trx('t_work')
  .where('id', '=', work.id)
  .update({
    dl_count: work.dl_count,
    price: work.price,
    review_count: work.review_count,
    rate_count: work.rate_count,
    rate_average_2dp: work.rate_average_2dp,
    rate_count_detail: JSON.stringify(work.rate_count_detail),
    rank: work.rank ? JSON.stringify(work.rank) : null
  }));


/**
 * Fetches metadata for a specific work id.
 * @param {Number} id Work identifier.
 */
const getWorkMetadata = id => new Promise((resolve, reject) => {
  // TODO: do this all in a single transaction?
  knex('t_work')
    .select('*')
    .where('id', '=', id)
    .first()
    .then((workRes) => {
      if (!workRes) {
        throw new Error(`There is no work with id ${id} in the database.`);
      }

      knex('t_circle')
        .select('name')
        .where('t_circle.id', '=', workRes.circle_id)
        .first()
        .then((circleRes) => {
          const work = {
            id: workRes.id,
            title: workRes.title,
            circle: { id: workRes.circle_id, name: circleRes.name },
            nsfw: Boolean(workRes.nsfw),
            release: workRes.release,

            dl_count: workRes.dl_count,
            price: workRes.price,
            review_count: workRes.review_count,
            rate_count: workRes.rate_count,
            rate_average_2dp: workRes.rate_average_2dp,
            rate_count_detail: JSON.parse(workRes.rate_count_detail),
            rank: workRes.rank ? JSON.parse(workRes.rank) : null
          };

          knex('r_tag_work')
            .select('tag_id', 'name')
            .where('r_tag_work.work_id', '=', id)
            .join('t_tag', 't_tag.id', '=', 'r_tag_work.tag_id')
            .then((tagsRes) => {
              work.tags = tagsRes.map(tag => ({ id: tag.tag_id, name: tag.name }));

              knex('r_va_work')
                .select('va_id', 'name')
                .where('r_va_work.work_id', '=', id)
                .join('t_va', 't_va.id', '=', 'r_va_work.va_id')
                .then((vaRes) => {
                  work.vas = vaRes.map(va => ({ id: va.va_id, name: va.name }));
                  resolve(work);
                });
            });
        });
    })
    .catch(err => reject(err));
});

/**
 * Tests if the given circle, tags and VAs are orphans and if so, removes them.
 * @param {*} trx Knex transaction object.
 * @param {*} circle Circle id to check.
 * @param {*} tags Array of tag ids to check.
 * @param {*} vas Array of VA ids to check.
 */
const cleanupOrphans = (trx, circle, tags, vas) => new Promise(async (resolve, reject) => {
  const getCount = (tableName, colName, colValue) => new Promise((resolveCount, rejectCount) => {
    trx(tableName)
      .select(colName)
      .where(colName, '=', colValue)
      .count()
      .first()
      .then(res => res['count(*)'])
      .then(count => resolveCount(count))
      .catch(err => rejectCount(err));
  });

  const promises = [];
  promises.push(new Promise((resolveCircle, rejectCircle) => {
    getCount('t_work', 'circle_id', circle)
      .then((count) => {
        if (count === 0) {
          trx('t_circle')
            .del()
            .where('id', '=', circle)
            .then(() => resolveCircle())
            .catch(err => rejectCircle(err));
        } else {
          resolveCircle();
        }
      });
  }));

  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    const count = await getCount('r_tag_work', 'tag_id', tag);

    if (count === 0) {
      promises.push(
        trx('t_tag')
          .delete()
          .where('id', '=', tag),
      );
    }
  }

  for (let i = 0; i < vas.length; i += 1) {
    const va = vas[i];
    const count = await getCount('r_va_work', 'va_id', va);

    if (count === 0) {
      promises.push(
        trx('t_va')
          .delete()
          .where('id', '=', va),
      );
    }
  }

  Promise.all(promises)
    .then((results) => {
      resolve(results);
    })
    .catch(err => reject(err));
});

/**
 * Removes a work and then its orphaned circles, tags & VAs from the database.
 * @param {Integer} id Work id.
 */
const removeWork = id => new Promise(async (resolve, reject) => {
  const trx = await knex.transaction();

  // Save circle, tags and VAs to array for later testing
  const circle = await trx('t_work').select('circle_id').where('id', '=', id).first();
  const tags = await trx('r_tag_work').select('tag_id').where('work_id', '=', id);
  const vas = await trx('r_va_work').select('va_id').where('work_id', '=', id);

  // Remove work and its relationships
  trx('t_work')
    .del()
    .where('id', '=', id)
    .then(trx('r_tag_work')
      .del()
      .where('work_id', '=', id)
      .then(trx('r_va_work')
        .del()
        .where('work_id', '=', id)
        .then(() => cleanupOrphans(
          trx,
          circle.circle_id,
          tags.map(tag => tag.tag_id),
          vas.map(va => va.va_id),
        ))
        .then(trx.commit)
        .then(() => resolve())))
    .catch(err => reject(err));
});

/**
 * Returns list of works by circle, tag or VA.
 * @param {Number} id Which id to filter by.
 * @param {String} field Which field to filter by.
 */
const getWorksBy = (id, field) => {
  let workIdQuery;

  switch (field) {
    case 'circle':
      return knex('t_work')
        .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
        .where('circle_id', '=', id);

    case 'tag':
      workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', '=', id);
      return knex('t_work')
        .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
        .where('id', 'in', workIdQuery);

    case 'va':
      workIdQuery = knex('r_va_work').select('work_id').where('va_id', '=', id);
      return knex('t_work')
        .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
        .where('id', 'in', workIdQuery);

    default:
      return knex('t_work')
        .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp');
  }
};

/**
 * 根据关键字查询音声
 * @param {String} keyword 
 */
const getWorksByKeyWord = (keyword) => {
  const workid = keyword.match(/RJ(\d{6})/) ? keyword.match(/RJ(\d{6})/)[1] : '';
  if (workid) {
    return knex('t_work')
      .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
      .where('id', '=', workid);
  }

  const circleIdQuery = knex('t_circle').select('id').where('name', 'like', `%${keyword}%`);

  const tagIdQuery = knex('t_tag').select('id').where('name', 'like', `%${keyword}%`);
  const vaIdQuery = knex('t_va').select('id').where('name', 'like', `%${keyword}%`);

  const workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', 'in', tagIdQuery).union([
    knex('r_va_work').select('work_id').where('va_id', 'in', vaIdQuery)
  ]);

  return knex('t_work')
    .select('id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
    .where('title', 'like', `%${keyword}%`)
    .orWhere('circle_id', 'in', circleIdQuery)
    .orWhere('id', 'in', workIdQuery);
};

/**
 * 获取所有社团/标签/声优的元数据列表
 * @param {Starting} field ['circle', 'tag', 'va'] 中的一个
 */
const getLabels = (field) => {
  if (field === 'circle') {
    return knex('t_work')
      .join(`t_${field}`, `${field}_id`, '=', `t_${field}.id`)
      .select(`t_${field}.id`, 'name')
      .groupBy(`${field}_id`)
      .count(`${field}_id as count`);
  } else if (field === 'tag' || field === 'va') {
    return knex(`r_${field}_work`)
      .join(`t_${field}`, `${field}_id`, '=', 'id')
      .select('id', 'name')
      .groupBy(`${field}_id`)
      .count(`${field}_id as count`);
  } 
};

/**
 * 创建一个新用户
 * @param {Object} user User object.
 */
const createUser = user => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (res) {
      throw new Error(`用户 ${user.name} 已存在.`);
    }
    return trx('t_user')
      .insert(user);
  }));

/**
 * 更新用户密码
 * @param {Object} user User object.
 * @param {String} newPassword new password
 */
const updateUserPassword = (user, newPassword) => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (!res) {
      throw new Error('用户名或密码错误.');
    }
    return trx('t_user')
      .where('name', '=', user.name)
      .update({
        password: newPassword
      });
  }));

/**
 * 重置用户密码为 "password"
 * @param {Object} user User object.
 */
const resetUserPassword = (user) => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (!res) {
      throw new Error('用户名错误.');
    }
    return trx('t_user')
      .where('name', '=', user.name)
      .update({
        password: 'password'
      });
  }));

/**
 * 删除用户
 * @param {Object} user User object.
 */
const deleteUser = users => knex.transaction(trx => trx('t_user')
  .where('name', 'in', users.map(user => user.name))
  .del());


module.exports = {
  knex, insertWorkMetadata, getWorkMetadata, removeWork, getWorksBy, getWorksByKeyWord, updateWorkMetadata, getLabels,
  createUser, updateUserPassword, resetUserPassword, deleteUser
};
