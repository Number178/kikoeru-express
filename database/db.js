// knex 操作数据库
const knex = require('knex')({
  client: 'sqlite3', // 数据库类型
  useNullAsDefault: true,
  connection: { // 连接参数
    filename: './db.sqlite3',
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
      dir: work.dir,
      title: work.title,
      circle_id: work.circle.id,
      nsfw: work.nsfw,
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
            nsfw: Boolean(workRes.nsfw)
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
 * Returns list of work ids by circle, tag or VA.
 * @param {Number} id Which id to filter by.
 * @param {String} field Which field to filter by.
 */
const getUnsortedWorksBy = (id, field) => {
  switch (field) {
    case 'circle':
      return knex('t_work')
        .select('id')
        .where('circle_id', '=', id);

    case 'tag':
      return knex('r_tag_work')
        .select('work_id as id')
        .where('tag_id', '=', id);

    case 'va':
      return knex('r_va_work')
        .select('work_id as id')
        .where('va_id', '=', id);

    default:
      return knex('t_work')
        .select('id');
  }
};
const getWorksBy = (id, field) => getUnsortedWorksBy(id, field).orderBy('id', 'desc');

const getWorksByKeyWord = (keyword) => {
  return knex('t_work')
    .select('id')
    .where('title', 'like', '%'+keyword+'%')
    .orderBy('id', 'desc');
}

const paginateResults = (query, startFrom, howMany, tableName) => query
  .where(tableName ? `${tableName}_id` : 'id', '<', startFrom)
  .limit(howMany);

  
module.exports = {
  knex, insertWorkMetadata, getWorkMetadata, removeWork, getWorksBy, getWorksByKeyWord, paginateResults
};
