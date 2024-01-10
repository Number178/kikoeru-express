const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { AILyricTaskStatus } = require('../common');
const { idNumberToCode, codeToIdNumber, idSplitter } = require('../filesystem/utils');

const databaseExist = fs.existsSync(path.join(config.databaseFolderDir, 'db.sqlite3'));

// knex 操作数据库
const connEnv = process.env.KNEX_ENV || process.env.NODE_ENV || 'development';
const conn = require('./knexfile')[connEnv]
const knex = require('knex')(conn);

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
      rank: work.rank ? JSON.stringify(work.rank) : null,
      lyric_status: work.lyric_status,
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
        .then(() => trx.raw(
          trx('r_va_work')
            .insert({
              va_id: work.vas[i].id,
              work_id: work.id,
            }).toString().replace('insert', 'insert or ignore'))));
    }

    return Promise.all(promises)
      .then(() => trx);
  }));

/**
 * 更新音声的动态元数据
 * @param {Object} work Work object.
 */
const updateWorkMetadata = (work, options = {}) => knex.transaction(async (trx) => {
  await trx('t_work')
    .where('id', '=', work.id)
    .update({
      dl_count: work.dl_count,
      price: work.price,
      review_count: work.review_count,
      rate_count: work.rate_count,
      rate_average_2dp: work.rate_average_2dp,
      rate_count_detail: JSON.stringify(work.rate_count_detail),
      rank: work.rank ? JSON.stringify(work.rank) : null,
    });

  if (options.includeVA || options.refreshAll) {
    await trx('r_va_work').where('work_id', work.id).del();
    for (const va of work.vas) {
      await trx.raw('INSERT OR IGNORE INTO t_va(id, name) VALUES (?, ?)', [va.id, va.name]);
      await trx.raw('INSERT OR IGNORE INTO r_va_work(va_id, work_id) VALUES (?, ?)', [va.id, work.id]);
    }
  }
  if (options.includeTags || options.refreshAll) {
    if (options.purgeTags) {
      await trx('r_tag_work').where('work_id', work.id).del();
    }
    for (const tag of work.tags) {
      await trx.raw('INSERT OR IGNORE INTO t_tag(id, name) VALUES (?, ?)', [tag.id, tag.name]);
      await trx.raw('INSERT OR IGNORE INTO r_tag_work(tag_id, work_id) VALUES (?, ?)', [tag.id, work.id]);
    }
  }

  // Fix a bug caused by DLsite changes
  if (options.includeNSFW) {
    await trx('t_work')
    .where('id', '=', work.id)
    .update({
      nsfw: work.nsfw
    });
  }

  if (options.refreshAll) {
    await trx('t_work')
    .where('id', '=', work.id)
    .update({
      nsfw: work.nsfw,
      title: work.title,
      release: work.release,
    });
  }
});

const updateWorkLyricStatus = (workId, new_status) => knex.transaction(async (trx) => {
  await trx('t_work')
    .where('id', '=', workId)
    .update({
      lyric_status: new_status,
    })
});

async function updateWorkLocalLyricStatus(isContainLocalLyric, currentStatus, workId) {
  let toStatus = currentStatus;
  if (isContainLocalLyric && !currentStatus.includes("local")) {
    toStatus = currentStatus.includes("ai") ? "ai_local" : "local";
  } else if (!isContainLocalLyric && currentStatus.includes("local")) {
    toStatus = currentStatus.includes("ai") ? "ai" : "";
  }
  if (toStatus !== currentStatus) {
    console.log('update local lyric status: ', workId, toStatus)
    await updateWorkLyricStatus(workId, toStatus);
    return true;
  }
  return false;
}

async function updateWorkAILyricStatus(isContainAILyric, currentStatus, workId) {
  let toStatus = currentStatus;
  if (isContainAILyric && !currentStatus.includes("ai")) {
    toStatus = currentStatus.includes("local") ? "ai_local" : "ai";
  } else if (!isContainAILyric && currentStatus.includes("ai")) {
    toStatus = currentStatus.includes("local") ? "local" : "";
  }
  if (toStatus !== currentStatus) {
    await updateWorkLyricStatus(workId, toStatus);
    return true;
  }
  return false;
}

/**
 * Fetches metadata for a specific work id.
 * @param {Number} id Work identifier.
 * @param {String} username 'admin' or other usernames for current user
 */
const getWorkMetadata = async (id, username) => {
  // TODO: do this all in a single transaction?
  // <= Yes, WTF is this
  // I think we are done.

    const ratingSubQuery = knex('t_review')
    .select(['t_review.work_id', 't_review.rating AS userRating', 't_review.review_text', 't_review.progress', knex.raw('strftime(\'%Y-%m-%d %H-%M-%S\', t_review.updated_at, \'localtime\') AS updated_at'), 't_review.user_name'])
    .join('t_work', 't_work.id', 't_review.work_id')
    .where('t_review.user_name', username).as('userrate');

    const histroyQuery = knex('t_play_histroy')
      .select([
        't_play_histroy.work_id',
        't_play_histroy.state AS state',
        't_play_histroy.updated_at AS play_updated_at'
      ])
      .join('t_work', 't_work.id', 't_play_histroy.work_id')
      .where('t_play_histroy.user_name', "=", username).as('histroy');

    let query = () => knex('staticMetadata')
      .select(['staticMetadata.*', 'userrate.userRating', 'userrate.review_text', 'userrate.progress', 'userrate.updated_at', 'userrate.user_name', 'histroy.state', 'histroy.play_updated_at'])
      .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
      .leftJoin(histroyQuery, 'histroy.work_id', 'staticMetadata.id')
      .where('id', '=', id);

    const work = await query();
    if (work.length === 0) throw new Error(`There is no work with id ${id} in the database.`);
    return work;
};

/**
 * Tests if the given circle, tags and VAs are orphans and if so, removes them.
 * @param {*} trx Knex transaction object.
 * @param {*} circle Circle id to check.
 * @param {*} tags Array of tag ids to check.
 * @param {*} vas Array of VA ids to check.
 */
const cleanupOrphans = async (trxProvider, circle, tags, vas)  => {
  const trx = await trxProvider();
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

  await Promise.all(promises);
};

/**
 * Delete work related lyrics and the lyric files if exists
 */
const deleteWorkTranslateTasks = async (work_id, trxProvider) => {
  const trx = await trxProvider();
  const tasks = await trx('t_translate_task').select('id').where('work_id', '=', work_id);

  for (const t of tasks) {
    const lyric_path = path.join(config.lyricFolderDir, `${t.id}.lrc`);
    if (fs.existsSync(lyric_path)) {
      fs.unlinkSync(lyric_path);
    }
  }

  await await trx('t_translate_task').del().where('work_id', '=', work_id);
}

/**
 * Removes a work and then its orphaned circles, tags & VAs from the database.
 * @param {Integer} id Work id.
 */
const removeWork = async (id, trxProvider) => {
  const trx = await trxProvider();
  // Save circle, tags and VAs to array for later testing
    const circle = await trx('t_work').select('circle_id').where('id', '=', id).first();
    const tags = await trx('r_tag_work').select('tag_id').where('work_id', '=', id);
    const vas = await trx('r_va_work').select('va_id').where('work_id', '=', id);

    // clear translate task for this work if exists
    await deleteWorkTranslateTasks(id, trxProvider);

    await trx('t_play_histroy').del().where('work_id', '=', id);
    await trx('r_tag_work').del().where('work_id', '=', id);
    await trx('r_va_work').del().where('work_id', '=', id);
    await trx('t_review').del().where('work_id', '=', id);
    await trx('t_work').del().where('id', '=', id);
    await cleanupOrphans(
      trxProvider,
      circle.circle_id,
      tags.map(tag => tag.tag_id),
      vas.map(va => va.va_id),
    )
};

/**
 * @param {Number} nsfw 0所有年龄分级，1仅全年龄，2仅十八禁
 */
function nsfwFilter(nsfw, knexQuery) {
  switch(nsfw) {
    case 1: return knexQuery.where('nsfw', '=', false); // 全年龄
    case 2: return knexQuery.where('nsfw', '=', true); // 仅R18
    default: return knexQuery; // 无年龄限制
  }
}

/**
 * @param {String} lyricFilter
 *      “”： 不限制
 *      “ai”： 包含ai字幕的作品
 *      “local”： 包含本地字幕的作品
 *      “ai_local”： 包含本地字幕或者ai字幕的作品
 */
function lyricFilter(lyricFilter, knexQuery) {
  switch(lyricFilter) {
    case "ai": return knexQuery.whereIn('lyric_status', ["ai", "ai_local"]); // 选择包含ai字幕的作品
    case "local": return knexQuery.whereIn('lyric_status', ["local", "ai_local"]); // 选择包含本地字幕的作品
    case "ai_local": return knexQuery.whereNot('lyric_status', ""); // 选择包含字幕的作品，无论是本地字幕还是ai字幕
    case "": return knexQuery; // 无限制
    default: return knexQuery;
  }
}

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
    .where('t_review.user_name', username).as('userrate')

  switch (field) {
    case 'circle':
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('circle_id', '=', id);

    case 'tag':
      workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', '=', id);
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('id', 'in', workIdQuery);

    case 'va':
      workIdQuery = knex('r_va_work').select('work_id').where('va_id', '=', id);
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('id', 'in', workIdQuery);

    default:
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id');
  }
};


const AdvanceSearchCondType = {
  UNKNOWN: 0,
  FUZZY: 1, // 全文模糊搜索，包括标题，
  VA: 2,
  TAG: 3,
  CIRCLE: 4,
}
// 高级搜索功能，支持多关键字聚合搜索
function advanceSearch(conditions, username) {
  const intersectQueryList = []
  for (let cond of conditions) {
    const data = cond.d;
    // 先只考虑全文模糊搜索（差不多够用了），以后再做其他的精准搜索类型特化
    if (cond.t === AdvanceSearchCondType.FUZZY) {
      // console.log("cond hit")
      // 构建模糊匹配，返回work_id query
      const circleIdQuery = knex('t_circle').select('id').where('name', 'like', `%${data}%`);
      const tagIdQuery = knex('t_tag').select('id').where('name', 'like', `%${data}%`);
      const vaIdQuery = knex('t_va').select('id').where('name', 'like', `%${data}%`);

      const workIdQuery =
        knex('t_work').select('id as work_id') // 用work_id这个名字来统一所有搜索到的作品id
          .where('title', 'like', `%${data}%`) // 作品标题名模糊匹配
          .orWhere('circle_id', 'in', circleIdQuery) // 社团名模糊匹配
          .union([
            knex('r_tag_work').select('work_id').where('tag_id', 'in', tagIdQuery), // 标签模糊匹配
            knex('r_va_work').select('work_id').where('va_id', 'in', vaIdQuery), // 声优模糊匹配
          ])

      intersectQueryList.push(workIdQuery)
      // console.log("cond sql = ", workIdQuery.toString())
    }
  }

  const ratingSubQuery = knex('t_review')
    .select(['t_review.work_id', 't_review.rating'])
    .join('t_work', 't_work.id', 't_review.work_id')
    .where('t_review.user_name', username).as('userrate')

  // 最终返回的work数据源
  let query = knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
    .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id');

  // 将前面的多个查询条件通过andWhere叠加到数据源条件中
  const queryWithConditions = intersectQueryList.reduce((accQuery, idQuery) => accQuery.andWhere("id", "in", idQuery), query)
  // console.log("advance search query = ", queryWithConditions.toString())
  return queryWithConditions
}

/**
 * 根据关键字查询音声
 * @param {String} keyword
 */
const getWorksByKeyWord = ({keyword, username = 'admin'} = {}) => {
  const ratingSubQuery = knex('t_review')
  .select(['t_review.work_id', 't_review.rating'])
  .join('t_work', 't_work.id', 't_review.work_id')
  .where('t_review.user_name', username).as('userrate')

  const codeRegex = /(RJ|BJ)?(\d{6,8})/i;
  const searchCode = keyword.match(codeRegex) ? keyword.match(codeRegex)[0].toUpperCase() : '';
  if (searchCode) {
    let query = knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id');

    if (/^[a-zA-Z]{2}/.test(searchCode)) { // search with RJ.../BJ...
      const idNumber = codeToIdNumber(searchCode);
      query = query.where('id', '=', idNumber);
    } else { // search only with numbers
      const idNumber = parseInt(searchCode);
      query = query
        .where('id', '=', idNumber)
        .orWhere('id', '=', idSplitter + idNumber);
    }

    return query;
  }

  const circleIdQuery = knex('t_circle').select('id').where('name', 'like', `%${keyword}%`);

  const tagIdQuery = knex('t_tag').select('id').where('name', 'like', `%${keyword}%`);
  const vaIdQuery = knex('t_va').select('id').where('name', 'like', `%${keyword}%`);

  const workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', 'in', tagIdQuery).union([
    knex('r_va_work').select('work_id').where('va_id', 'in', vaIdQuery)
  ]);


  return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
    .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
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

// 删除星标、评语及进度
const deleteUserReview = (username, workid) => knex.transaction(trx => trx('t_review')
  .where('user_name', '=', username)
  .andWhere('work_id', '=', workid)
  .del());

// 读取星标及评语 + 作品元数据
const getWorksWithReviews = async ({username = '', limit = 1000, offset = 0, orderBy = 'release', sortOption = 'desc', filter} = {}) => {
  let works = [];
  let totalCount = 0;

  const ratingSubQuery = knex('t_review')
  .select(['t_review.work_id', 't_review.rating AS userRating', 't_review.review_text', 't_review.progress', knex.raw('strftime(\'%Y-%m-%d %H-%M-%S\', t_review.updated_at, \'localtime\') AS updated_at'), 't_review.user_name'])
  .join('t_work', 't_work.id', 't_review.work_id')
  .where('t_review.user_name', username).as('userrate');

  let query = () => knex('staticMetadata')
    .select(['staticMetadata.*', 'userrate.userRating', 'userrate.review_text', 'userrate.progress', 'userrate.updated_at', 'userrate.user_name'])
    .join(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
    .orderBy(orderBy, sortOption).orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }]);

  if (filter) {
    totalCount = await query().where('progress', '=', filter).count('id as count');
    works = await query().where('progress', '=', filter).limit(limit).offset(offset);
  } else {
    totalCount = await query().count('id as count');
    works = await query().limit(limit).offset(offset);
  }

  return {works, totalCount};
};

const getPlayHistroy = async ({username = '', sortOption = 'desc', limit = 1000, offset = 0}) => {
  let works = []
  let totalCount = 0
  const histroyQuery = knex('t_play_histroy')
    .select([
      't_play_histroy.work_id',
      't_play_histroy.state AS state',
      't_play_histroy.updated_at AS play_updated_at'
    ])
    .join('t_work', 't_work.id', 't_play_histroy.work_id')
    .where('t_play_histroy.user_name', "=", username).as('histroy');

  const query = () => knex('staticMetadata')
    .select(['staticMetadata.*', 'histroy.state', 'histroy.play_updated_at'])
    .join(histroyQuery, 'histroy.work_id', 'staticMetadata.id')
    .orderBy('play_updated_at', sortOption);

  totalCount = await query().count('id as count');
  works = await query().limit(limit).offset(offset);

  return {works, totalCount}
}

const updatePlayHistroy = async (username, work_id, state) => knex.transaction(async(trx) => {
  await trx.raw('INSERT OR IGNORE INTO t_play_histroy (user_name, work_id, state) VALUES (?, ?, ?);', [username, work_id, state])
  await trx.raw('UPDATE t_play_histroy SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [state, username, work_id]);
});

async function deletePlayHistroy(username, work_id) {
  await knex('t_play_histroy').select('*').where('work_id', '=', work_id).where('user_name', '=', username).first().del();
}

const getMetadata = ({field = 'circle', id} = {}) => {
  const validFields = ['circle', 'tag', 'va'];
  if (!validFields.includes(field)) throw new Error('无效的查询域');
  return knex(`t_${field}`)
    .select('*')
    .where('id', '=', id)
    .first()
};

const createTranslateTask = async (work_id, audio_path) => {
  console.log('createTranslateTask', work_id, audio_path)
  
  let query = () => knex('t_translate_task')
    .select('id')
    .where('work_id', '=', work_id)
    .where('audio_path', '=', audio_path);

  const work = await query();
  const rjcode = idNumberToCode(work_id);
  if (work.length > 0) {
    throw new Error(`${rjcode} already contain translation task[${audio_path}] in the database.`);
  }
  console.log('no duplicate task, insert task now')

  return await knex.transaction((trx) => trx('t_translate_task').insert({
    work_id,
    audio_path,
    status: AILyricTaskStatus.PENDING,
    worker_name: "",
    worker_status: "",
    secret: "",
  }));
};

/**
 * Returns list of tasks for translate
 * @param {Number} work_id Which work id to filter by.
 * @param {String} file_name Which audio of this work
 * @param {Array} array of constants of AILyricTaskStatus
 */
const getTranslateTasks = (work_id, file_name, status_arr) => {
  let query = knex('t_translate_task')
    .select([
      't_translate_task.id',
      't_translate_task.work_id',
      't_translate_task.audio_path',
      't_translate_task.status',
      't_translate_task.worker_name',
      't_translate_task.worker_status',
      't_work.title',
    ])
    .leftJoin('t_work', 't_translate_task.work_id', 't_work.id')

  if (work_id > 0) {
    query = query.where('t_translate_task.work_id', '=', work_id)
  }

  if (file_name) {
    query = query.where('t_translate_task.audio_path', 'like', `%${file_name}%`)
  }

  if (status_arr.length > 0) {
    query = query.whereIn('t_translate_task.status', status_arr);
  }

  return query;
};

async function markWorkAILyricStatus(work_id, username, hasLyric) {
  const workList = await getWorkMetadata(work_id, username);
  const work = workList[0];

  await updateWorkAILyricStatus(hasLyric, work.lyric_status, work.id);
}

async function getWorkMemo(work_id) {
  const work = await knex('t_work')
    .select('id', 'memo')
    .where('id', '=', work_id)
    .first();

  return JSON.parse(work.memo);
}

async function setWorkMemo(work_id, memo) {
  await knex('t_work')
    .where('id', '=', work_id)
    .update({
      memo: JSON.stringify(memo)
    });
}

module.exports = {
  knex, insertWorkMetadata, getWorkMetadata, removeWork, getWorksBy, getWorksByKeyWord, updateWorkMetadata,
  updateWorkLyricStatus,
  updateWorkLocalLyricStatus, updateWorkAILyricStatus,
  getLabels, getMetadata,
  createUser, updateUserPassword, resetUserPassword, deleteUser,
  getWorksWithReviews, updateUserReview, deleteUserReview,
  databaseExist, getPlayHistroy, updatePlayHistroy, deletePlayHistroy,
  createTranslateTask, getTranslateTasks, markWorkAILyricStatus,
  nsfwFilter, lyricFilter,
  getWorkMemo, setWorkMemo,
  advanceSearch,
};
