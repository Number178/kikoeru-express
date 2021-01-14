const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { strftime } = require('./strftime')

const databaseFolderDir = config.databaseFolderDir;
if (!fs.existsSync(databaseFolderDir)) {
  try {
    fs.mkdirSync(databaseFolderDir, { recursive: true });
  } catch(err) {
    console.error(` ! 在创建存放数据库文件的文件夹时出错: ${err.message}`);
  }
}

const databaseExist = fs.existsSync(path.join(databaseFolderDir, 'db.sqlite3'));

// knex 操作数据库
const knex = require('knex')({
  client: 'sqlite3', // 数据库类型
  useNullAsDefault: true,
  connection: { // 连接参数
    filename: path.join(databaseFolderDir, 'db.sqlite3'),
  },
  acquireConnectionTimeout: 5000, // 连接计时器
  pool: {
    afterCreate: (conn, cb) => {
      conn.run('PRAGMA foreign_keys = ON', cb)
    }
  }
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
 * @param {String} username 'admin' or other usernames for current user
 */
const getWorkMetadata = (id, username) => new Promise((resolve, reject) => {
  // TODO: do this all in a single transaction?
  // <= Yes, WTF is this

    knex.raw(`
    SELECT t_work.*,
      t_circle.name AS circlename,
      t_tag.id AS tagid,
      t_tag.name AS tagname,
      t_va.id AS vaid,
      t_va.name AS vaname,
      userrate.rating,
      userrate.review_text,
      userrate.progress,
      datetime(userrate.updated_at,'localtime')
    FROM t_work
      JOIN t_circle on t_circle.id = t_work.circle_id
      JOIN r_tag_work on r_tag_work.work_id = t_work.id
      JOIN t_tag on t_tag.id = r_tag_work.tag_id
      JOIN r_va_work on r_va_work.work_id = t_work.id
      join t_va on t_va.id = r_va_work.va_id
      LEFT JOIN (
        SELECT t_review.work_id,
          t_review.rating,
          t_review.review_text,
          t_review.progress,
          t_review.updated_at
        FROM t_review
          JOIN t_work on t_work.id = t_review.work_id
          JOIN t_user on t_review.user_name = t_user.name
        WHERE t_review.user_name = ?
      ) AS userrate
      ON userrate.work_id = t_work.id
    WHERE t_work.id = ?;`, [username, id])
      .then(res => {
        if (res.length === 0) throw new Error(`There is no work with id ${id} in the database.`);
        let work = {};
        let result = res[0];
        work.id= result.id;
        work.title= result.title;
        work.circle= {id: result.circle_id, name: result.circlename};
        work.nsfw= Boolean(result.nsfw);
        work.release= result.release;

        work.dl_count= result.dl_count;
        work.price= result.price;
        work.review_count= result.review_count;
        work.rate_count= result.rate_count;
        work.rate_average_2dp= result.rate_average_2dp;
        work.rate_count_detail= JSON.parse(result.rate_count_detail);
        work.rank= result.rank ? JSON.parse(result.rank) : null;

        // Get unique tags and vas records
        let tags = new Set();
        let vas = new Set();
        let tagRecord = [];
        let vasRecord = [];
        for (let record of res) {
          if (!tags.has(record.tagname)) {
            tags.add(record.tagname);
            tagRecord.push({id: record.tagid, name: record.tagname});
          }
          if (!vas.has(record.vaname)) {
            vas.add(record.vaname);
            vasRecord.push({id: record.vaid, name: record.vaname});
          }
        }
        work.tags = tagRecord;
        work.vas = vasRecord;

        work.userRating= result.rating;
        work.progress = result.progress;
        work.review_text = result.review_text;

        resolve(work);
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
const cleanupOrphans = async (trx, circle, tags, vas)  => {
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

  return Promise.all(promises);
};

/**
 * Removes a work and then its orphaned circles, tags & VAs from the database.
 * @param {Integer} id Work id.
 */
const removeWork = async (id) => {
  await knex.transaction(async (trx) => {
  // Save circle, tags and VAs to array for later testing
    const circle = await trx('t_work').select('circle_id').where('id', '=', id).first();
    const tags = await trx('r_tag_work').select('tag_id').where('work_id', '=', id);
    const vas = await trx('r_va_work').select('va_id').where('work_id', '=', id);

    await trx('r_tag_work').del().where('work_id', '=', id);
    await trx('r_va_work').del().where('work_id', '=', id);
    await trx('t_review').del().where('work_id', '=', id);
    await trx('t_work').del().where('id', '=', id);
    await cleanupOrphans(
      trx,
      circle.circle_id,
      tags.map(tag => tag.tag_id),
      vas.map(va => va.va_id),
    )
  });
};

/**
 * Returns list of works by circle, tag or VA.
 * @param {Number} id Which id to filter by.
 * @param {String} field Which field to filter by.
 */
const getWorksBy = ({id, field, username = ''} = {}) => {
  let workIdQuery;
  const ratingSubQuery = knex('t_review')
    .select(['t_review.work_id', 't_review.rating'])
    .join('t_work', 't_work.id', 't_review.work_id')
    .join('t_user', 't_user.name', 't_review.user_name')
    .where('t_review.user_name', username).as('userrate')
  
  switch (field) {
    case 'circle':
      return knex('t_work')
        .select('id')
        .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id')
        .where('circle_id', '=', id);

    case 'tag':
      workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', '=', id);
      return knex('t_work')
        .select('id')
        .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id')
        .where('id', 'in', workIdQuery);

    case 'va':
      workIdQuery = knex('r_va_work').select('work_id').where('va_id', '=', id);
      return knex('t_work')
        .select('id')
        .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id')
        .where('id', 'in', workIdQuery);

    default:
      return knex('t_work')
        .select('id')
        .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id');
  }
};

/**
 * 根据关键字查询音声
 * @param {String} keyword 
 */
const getWorksByKeyWord = ({keyword, username = 'admin'} = {}) => {
  const ratingSubQuery = knex('t_review')
  .select(['t_review.work_id', 't_review.rating'])
  .join('t_work', 't_work.id', 't_review.work_id')
  .join('t_user', 't_user.name', 't_review.user_name')
  .where('t_review.user_name', username).as('userrate')

  const workid = keyword.match(/((R|r)(J|j))?(\d{6})/) ? keyword.match(/((R|r)(J|j))?(\d{6})/)[4] : '';
  if (workid) {
    return knex('t_work')
      .select('id', 'release', 'rating', 'dl_count', 'review_count', 'price', 'rate_average_2dp')
      .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id')
      .where('id', '=', workid);
  }

  const circleIdQuery = knex('t_circle').select('id').where('name', 'like', `%${keyword}%`);

  const tagIdQuery = knex('t_tag').select('id').where('name', 'like', `%${keyword}%`);
  const vaIdQuery = knex('t_va').select('id').where('name', 'like', `%${keyword}%`);

  const workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', 'in', tagIdQuery).union([
    knex('r_va_work').select('work_id').where('va_id', 'in', vaIdQuery)
  ]);


  return knex('t_work')
    .select('id', 'rating', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp', 'nsfw')
    .leftJoin(ratingSubQuery, 'userrate.work_id', 't_work.id')
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





/**
 * 创建一个新用户收藏夹
 * @param {Object} favorite User Favorite object.
 */
const createUserFavorite = (username, favorite) => knex.transaction(trx => trx('t_favorite')
  .where('name', '=', favorite.name)
  .andWhere('user_name', '=', username)
  .first()
  .then((res) => {
    if (res) {
      throw new Error(`用户 ${username} 的收藏夹 ${favorite.name} 已存在.`);
    }
    return trx('t_favorite')
      .insert({
        user_name: username,
        name: favorite.name,
        works: JSON.stringify(favorite.works)
      });
  }));

/**
 * 更新用户收藏夹
 * @param {Object} favorite User favorite object.
 */
const updateUserFavorite = (username, oldFavoriteName, newFavorite) => knex.transaction(trx => trx('t_favorite')
  .where('name', '=', oldFavoriteName)
  .andWhere('user_name', '=', username)
  .first()
  .then((res) => {
    if (!res) {
      throw new Error(`用户 ${username} 的收藏夹 $oldFavoriteName} 不存在.`);
    }
    return trx('t_favorite')
      .where('name', '=', oldFavoriteName)
      .andWhere('user_name', '=', username)
      .update({
        name: newFavorite.name,
        works: JSON.stringify(newFavorite.works)
      });
  }));

/**
 * 更新用户收藏夹
 * @param {String} user_name User name
 * @param {Array} favorites User favorites.
 */
const deleteUserFavorites = (username, favoriteNames) => knex.transaction(trx => trx('t_favorite')
  .where('user_name', '=', username)
  .andWhere('name', 'in', favoriteNames)
  .del());

const getUserFavorites = username => knex('t_favorite')
  .select('name', 'works')
  .where('user_name', '=', username)
  .then(favorites => favorites.map((favorite) => {
    favorite.works = JSON.parse(favorite.works);
    return favorite;
  }));

// 添加星标或评语或进度
const updateUserReview = async (username, workid, rating, review_text = '', progress = '', starOnly = true, progressOnly= false) => knex.transaction(async(trx) => {
    //UPSERT
    if (starOnly) {
      await trx.raw('UPDATE t_review SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [rating, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, rating) VALUES (?, ?, ?);', [username, workid, rating]); 
    } else if (progressOnly) {
      await trx.raw('UPDATE t_review SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [progress, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, progress) VALUES (?, ?, ?);', [username, workid, progress]); 
    } else {
      await trx.raw('UPDATE t_review SET rating = ?, review_text = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [rating, review_text, progress, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, rating, review_text, progress) VALUES (?, ?, ?, ?, ?);', [username, workid, rating, review_text, progress]); 
    }
});

// 删除星标及评语
const deleteUserReview = (username, workid) => knex.transaction(trx => trx('t_review')
  .where('user_name', '=', username)
  .andWhere('work_id', '=', workid)
  .del());

// TODO 写migration
const getWorksWithReviews = ({username = '', limit = 1000, offset = 0, orderBy = 'release', sortOption = 'desc', filter} = {}) => knex.transaction(async(trx) => {
  await trx.raw(
    `CREATE VIEW IF NOT EXISTS userMetadata AS
    SELECT t_work.id,
      t_work.title,
      json_object('id', t_work.circle_id, 'name', t_circle.name) AS circleObj,
      t_work.release,
      t_work.review_count,
      t_work.dl_count,
      t_work.nsfw,
      t_va.id AS vaid, 
      t_va.name AS vaname,
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
    GROUP BY t_work.id
  `);
  
  let works = [];
  let query = () => trx('userMetadata').where('user_name', '=', username)
  .orderBy(orderBy, sortOption).orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }])
  .limit(limit).offset(offset);

  if (filter) {
    works = await query().where('progress', '=', filter);
  } else {
    works = await query();
  }

  if (works.length > 0) {
    works.map(record => {
      record.circle = JSON.parse(record.circleObj);
      record.vas = JSON.parse(record.vaObj)['vas'];
      record.updated_at = strftime('%F', record.updated_at);
    })
  }

  return works;
});

module.exports = {
  knex, insertWorkMetadata, getWorkMetadata, removeWork, getWorksBy, getWorksByKeyWord, updateWorkMetadata, getLabels,
  createUser, updateUserPassword, resetUserPassword, deleteUser,
  createUserFavorite, updateUserFavorite, deleteUserFavorites, getUserFavorites, 
  getWorksWithReviews, updateUserReview, deleteUserReview, databaseExist
};
