const express = require('express');
const router = express.Router();
const { query, body } = require('express-validator');
const { config } = require('../config');
const db = require('../database/db');
const normalize = require('./utils/normalize');
const { isValidRequest } = require('./utils/validate');

const PAGE_SIZE = config.pageSize || 12;


router.get('/',
  query('page').optional({nullable: true}).isInt(),
  query('sort').optional({nullable: true}).isIn(['desc', 'asc']),
  query('seed').optional({nullable: true}).isInt(),
  query('filter').optional({nullable: true}).isIn(['marked', 'listening', 'listened', 'replay', 'postponed']),
  // eslint-disable-next-line no-unused-vars
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const currentPage = parseInt(req.query.page) || 1;
    // 通过 "音声id, 贩卖日, 评价, 用户评价, 售出数, 评论数量, 价格, 平均评价, 全年龄新作" 排序
    // ['id', 'release', 'rating', 'dl_count', 'review_count', 'price', 'rate_average_2dp, nsfw']
    const order = req.query.order || 'release';
    const sort = req.query.sort || 'desc';
    const offset = (currentPage - 1) * PAGE_SIZE;
    const username = config.auth ? req.user.name : 'admin';
    const filter = req.query.filter;
    
    try {
      const {works, totalCount} = await db.getWorksWithReviews({username: username, limit: PAGE_SIZE, offset: offset, orderBy: order, sortOption: sort, filter});

      normalize(works, {dateOnly: true});

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
      console.error(err)
    }
});

// 提交用户评价
router.put('/',
  body('work_id').isInt(),
  body('rating').optional({nullable: true}).isInt(),
  body('progress').optional({nullable: true}).isIn(['marked', 'listening', 'listened', 'replay', 'postponed']),
  body('starOnly').optional({nullable: true}).isBoolean(),
  body('progressOnly').optional({nullable: true}).isBoolean(),
  // eslint-disable-next-line no-unused-vars
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    let username = config.auth ? req.user.name : 'admin';
    let starOnly = true;
    let progressOnly = false;
    if (req.query.starOnly === 'false') {
      starOnly = false;
    }
    if (req.query.progressOnly === 'true') {
      progressOnly = true
    }
    
    db.updateUserReview(username, req.body.work_id, req.body.rating, req.body.review_text, req.body.progress, starOnly, progressOnly)
        .then(() => {
          if (progressOnly) {
            res.send({ message: '更新进度成功' });
          } else {
            res.send({ message: '评价成功' });
          }
        }).catch((err) =>{
          res.status(500).send({ error: '评价失败，服务器错误' });
          console.error(err);
        })
});

// 删除用户标记
router.delete('/',
  query('work_id').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    let username = config.auth ? req.user.name : 'admin';
    db.deleteUserReview(username, req.query.work_id)
      .then(() => {
        res.send({message: '删除标记成功'});
      }).catch((err) => next(err));
});

module.exports = router;