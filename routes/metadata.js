const path = require('path');
const express = require('express');
const router = express.Router();
const { param, query} = require('express-validator');
const db = require('../database/db');
const { getTrackList, toTree } = require('../filesystem/utils');
const { config } = require('../config');
const normalize = require('./utils/normalize');
const { isValidRequest } = require('./utils/validate');
const { formatID, scrapeWorkMemo } = require('../filesystem/utils');

const PAGE_SIZE = config.pageSize || 12;

// GET work cover image
router.get('/cover/:id',
  param('id').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const rjcode = formatID(req.params.id);
    const type = req.query.type || 'main'; // 'main', 'sam', '240x240', '360x360'
    res.sendFile(path.join(config.coverFolderDir, `RJ${rjcode}_img_${type}.jpg`), (err) => {
      if (err) {
        res.sendFile(path.join(__dirname, '../static/no-image.jpg'), (err2) => {
          if (err2) {
            next(err2);
          }
        });
      }
    });
});

// GET work metadata
router.get('/work/:id',
  param('id').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    let username = 'admin';
    if (config.auth) {
      username = req.user.name;
    }
    db.getWorkMetadata(req.params.id, username)
      .then(work => {
        // work is an Array of length 1
        normalize(work);
        res.send(work[0]);
      })
      .catch(err => next(err));
  });

// GET track list in work folder
router.get('/tracks/:id',
  param('id').isInt(),
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;
    const work_id = req.params.id;

    try {
      const work = await db.knex('t_work')
        .select('title', 'root_folder', 'dir', 'memo')
        .where('id', '=', work_id)
        .first();

      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (rootFolder) {
        try {
          const tracks = await getTrackList(work_id, path.join(rootFolder.path, work.dir), JSON.parse(work.memo))
          const tree = toTree(tracks, work.title, work.dir, rootFolder);
          res.send(tree);
        } catch (err) {
          res.status(500).send({error: '获取文件列表失败，请检查文件是否存在或重新扫描清理'});
        }
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    } catch (err) {
      next(err);
    }
});

// GET list of work ids without any search
router.get('/works', 
  query('page').optional({nullable: true}).isInt(),
  query('order').optional({nullable: true}).isIn(["release", "rating", "dl_count", "price", "rate_average_2dp", "review_count", "id", "created_at", "random", "betterRandom"]),
  query('sort').optional({nullable: true}).isIn(['desc', 'asc']),
  query('nsfw').optional({nullable: true}).isInt().isIn([0/* 无年龄限制 */, 1 /* 全年龄 */, 2 /* 仅R18 */]),
  query('seed').optional({nullable: true}).isInt(),
  // eslint-disable-next-line no-unused-vars
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const currentPage = parseInt(req.query.page) || 1;
    // 通过 "音声id, 贩卖日, 评价, 用户评价, 售出数, 评论数量, 价格, 平均评价, 全年龄新作， 入库时间， 随机， 随机一个" 排序
    // ['id', 'release', 'rating', 'dl_count', 'review_count', 'price', 'rate_average_2dp', 'nsfw', 'created_at']
    const order = req.query.order || 'release';
    const sort = req.query.sort || 'desc';
    const nsfw = parseInt(req.query.nsfw || '0');
    const lyric = req.query.lyric || '';
    const offset = (currentPage - 1) * PAGE_SIZE;
    const username = config.auth ? req.user.name : 'admin';
    const shuffleSeed = req.query.seed ? req.query.seed : 7;

    try {
      const query = () => db.lyricFilter(lyric, db.nsfwFilter(nsfw, db.getWorksBy({username: username})));
      const totalCount = await query().count('id as count');

      let works = null;

      if (order === 'random') {
        // 随机排序+分页 hack
        works = await query().offset(offset).limit(PAGE_SIZE).orderBy(db.knex.raw('id % ?', shuffleSeed));
      } else if (order === 'betterRandom') {
        // 随心听专用，不支持分页
        works = await query().limit(1).orderBy(db.knex.raw('random()'));
      } else {
        works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort)
        .orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }]);
      }

      works = normalize(works);
    
      res.send({
        works,
        pagination: {
          currentPage,
          pageSize: PAGE_SIZE,
          totalCount: totalCount[0]['count']
        }
      });
    } catch(err) {
      res.status(500).send({error: '服务器错误'});
      console.error(err);
      // next(err);
    }
});

// GET name of a circle/tag/VA
router.get('/:field(circle|tag|va)s/:id',
  param('field').isIn(['circle', 'tag', 'va']),
  (req, res, next) => {
    // In case regex matching goes wrong
    if(!isValidRequest(req, res)) return;

    return db.getMetadata({field: req.params.field, id: req.params.id})
      .then(item => {
        if (item) {
          res.send(item); 
        } else {
          const errorMessage= {
            'circle': `社团${req.params.id}不存在`,
            'tag': `标签${req.params.id}不存在`,
            'va': `声优${req.params.id}不存在`
          };
          res.status(404).send({error: errorMessage[req.params.field]});
        }
      })
      .catch(err => next(err));
});

// eslint-disable-next-line no-unused-vars
router.get('/search', async (req, res, next) => {
  // const keyword = req.params.keyword ? req.params.keyword.trim() : '';
  const keyword = req.query.keyword ? req.query.keyword.trim() : '';
  const isAdvance = 1 === parseInt(req.query.isAdvance || "0") // 是否开启高级搜索模式

  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 用户评价， 售出数, 评论数量, 价格, 平均评价, 全年龄新作" 排序
  // ['id', 'release', 'rating', 'dl_count', 'review_count', 'price', 'rate_average_2dp', 'nsfw']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc';
  const nsfw = parseInt(req.query.nsfw || '0'); 
  const lyric = req.query.lyric || '';
  const offset = (currentPage - 1) * PAGE_SIZE;
  const username = config.auth ? req.user.name : 'admin';
  const shuffleSeed = req.query.seed ? req.query.seed : 7;
  
  try {
    let query = null;
    if (isAdvance) {
      // 临时测试，如果keyword是json字符串，则强制进入高级测试内容
      const conditions = JSON.parse(keyword);
      // console.warn(`in advance mode(page = ${currentPage}), search for: `, conditions)
      query = () => db.lyricFilter(lyric, db.nsfwFilter(nsfw, 
        db.advanceSearch(conditions, username)
      ))
    } else {
      // console.warn("normal keyword search, keyword = ", keyword)
      query = () => db.lyricFilter(lyric, db.nsfwFilter(nsfw, db.getWorksByKeyWord({keyword: keyword, username: username})));
    }

    const totalCount = await query().count('id as count');

    let works = null;

    if (order === 'random') {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy(db.knex.raw('id % ?', shuffleSeed));
    } else {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort)
        .orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }]);
    }

    works = normalize(works);

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    res.status(500).send({error: '查询过程中出错'});
    console.error(err);
    // next(err);
  }
});

// GET list of work ids, restricted by circle/tag/VA
router.get('/:field(circle|tag|va)s/:id/works',
  param('field').isIn(['circle', 'tag', 'va']),
  // eslint-disable-next-line no-unused-vars
  async (req, res, next) => {
    // In case regex matching goes wrong
    if(!isValidRequest(req, res)) return;

    const currentPage = parseInt(req.query.page) || 1;
    // 通过 "音声id, 贩卖日, 用户评价, 售出数, 评论数量, 价格, 平均评价, 全年龄新作" 排序
    // ['id', 'release', 'rating', 'dl_count', 'review_count', 'price', 'rate_average_2dp, 'nsfw']
    const order = req.query.order || 'release';
    const sort = req.query.sort || 'desc'; // ['desc', 'asc]
    const nsfw = parseInt(req.query.nsfw || '0'); 
    const lyric = req.query.lyric || '';
    const offset = (currentPage - 1) * PAGE_SIZE;
    const username = config.auth ? req.user.name : 'admin';
    const shuffleSeed = req.query.seed ? req.query.seed : 7;

    try {
      const query = () => db.lyricFilter(lyric, db.nsfwFilter(nsfw, db.getWorksBy({id: req.params.id, field: req.params.field, username: username})));
      const totalCount = await query().count('id as count');

      let works = null;

      if (order === 'random') {
        works = await query().offset(offset).limit(PAGE_SIZE).orderBy(db.knex.raw('id % ?', shuffleSeed));
      } else {
        works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort)
        .orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }]);
      }

      works = normalize(works);

      res.send({
        works,
        pagination: {
          currentPage,
          pageSize: PAGE_SIZE,
          totalCount: totalCount[0]['count']
        }
      });
    } catch(err) {
      res.status(500).send({error: '查询过程中出错'});
      console.error(err);
      // next(err);
    }
});

// GET list of circles/tags/VAs
router.get('/:field(circle|tag|va)s/',
  param('field').isIn(['circle', 'tag', 'va']),
  (req, res, next) => {
    // In case regex matching goes wrong
    if(!isValidRequest(req, res)) return;

    const field = req.params.field;
    db.getLabels(field)
      .orderBy(`name`, 'asc')
      .then(list => res.send(list))
      .catch(err => next(err));
});

// 刷新单个作品文件夹中的文件信息记录，例如音频文件发生变动后，通过这个请求重新扫描音频文件时长
router.post('/work/scan/:id',
  param('id').isInt(),
  async function(req, res) {
    if(!isValidRequest(req, res)) return;

    const work_id = parseInt(req.params.id);
    try {
      const work = await db.knex('t_work')
        .select('root_folder', 'dir', 'lyric_status', 'memo')
        .where('id', '=', work_id)
        .first();
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (!rootFolder) {
        res.status(500).send({error: "扫描作品文件失败，没有找到rootFolder: " + work.root_folder})
        return;
      }
      const memo = await scrapeWorkMemo(work_id, path.join(rootFolder.path, work.dir), JSON.parse(work.memo));
      await db.setWorkMemo(work_id, memo);
      await db.updateWorkLocalLyricStatus(memo.isContainLyric, work.lyric_status, work_id); // 尝试更新歌词状态
      res.send({ memo });
    } catch (err) {
      console.error(err);
      res.status(500).send({error: "重试翻译任务失败：" + err.message})
    }
  } 
)

module.exports = router;
