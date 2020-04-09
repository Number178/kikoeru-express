const path = require('path');
const express = require('express');
const expressJwt = require('express-jwt'); // 把 JWT 的 payload 部分赋值于 req.user

const db = require('./database/db');
const { getTrackList } = require('./filesystem/utils');

const config = require('./config.json');

const PAGE_SIZE = config.pageSize || 12;
const router = express.Router()

// GET work cover image
router.get('/cover/:id', (req, res, next) => {
  const rjcode = (`000000${req.params.id}`).slice(-6);
  res.sendFile(path.join(config.coverFolderDir, `RJ${rjcode}.jpg`), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, './static/no-image.jpg'), (err2) => {
        if (err2) {
          next(err2);
        }
      });
    }
  });
});

// expressJwt 中间件 
// 验证指定 http 请求的 JsonWebTokens 的有效性, 如果有效就将 JsonWebTokens 的值设置到 req.user 里面, 然后路由到相应的 router
if (config.auth) router.use(expressJwt({ secret: config.jwtsecret }));

// GET work metadata
router.get('/work/:id', (req, res, next) => {
  db.getWorkMetadata(req.params.id)
    .then(work => res.send(work))
    .catch(err => next(err));
});

// GET track list in work folder
router.get('/tracks/:id', (req, res, next) => {
  db.knex('t_work')
    .select('root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
        .then(tracks => res.send(tracks));
    })
    .catch(err => next(err));
});

// GET (stream) a specific track from work folder
router.get('/stream/:id/:index', (req, res, next) => {
  db.knex('t_work')
    .select('root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
        .then((tracks) => {
          const track = tracks[req.params.index];
          res.sendFile(path.join(rootFolder.path, work.dir, track.subtitle || '', track.title));
        })
        .catch(err => next(err));
    });
});

// GET list of work ids
router.get('/works', async (req, res, next) => {
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc';
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksBy();
    const totalCount = await query().count('id as count');
    const works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET name of a circle/tag/VA
router.get('/get-name/:field/:id', (req, res, next) => {
  if (req.params.field === 'undefined') {
    return res.send(null);
  }

  return db.knex(`t_${req.params.field}`)
    .select('name')
    .where('id', '=', req.params.id)
    .first()
    .then(name => res.send(name.name))
    .catch(err => next(err));
});

router.get('/search/:keyword?', async (req, res, next) => {
  const keyword = req.params.keyword || '';
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc';
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksByKeyWord(keyword);
    const totalCount = await query().count('id as count');
    const works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET list of work ids, restricted by circle/tag/VA
router.get('/:field/:id', async (req, res, next) => {
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc'; // ['desc', 'asc]
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksBy(req.params.id, req.params.field);
    const totalCount = await query().count('id as count');
    const works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET list of circles/tags/VAs
router.get('/(:field)s/', (req, res, next) => {
  const field = req.params.field;
  db.getLabels(field)
    .orderBy(`name`, 'asc')
    .then(list => res.send(list))
    .catch(err => next(err));
});


module.exports = router;
