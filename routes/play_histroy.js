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
  // eslint-disable-next-line no-unused-vars
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const currentPage = parseInt(req.query.page) || 1;
    const sort = req.query.sort || 'desc';
    const offset = (currentPage - 1) * PAGE_SIZE;
    const username = config.auth ? req.user.name : 'admin';
    
    try {
      const {works, totalCount} = await db.getPlayHistroy({
        username: username,
        limit: PAGE_SIZE,
        offset: offset,
        sortOption: sort,
      });
      // console.log(`works = ${works}, totalCount = ${totalCount[0]['count']}`)

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

// 更新播放状态
router.put('/',
  body('work_id').isInt(),
  body('state').isObject(),
  // eslint-disable-next-line no-unused-vars
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    let username = config.auth ? req.user.name : 'admin';

    // console.log('update historoy =', username, req.body.work_id, req.body.state)
    // console.log(`config.auth = ${config.auth}`)
    
    db.updatePlayHistroy(username, req.body.work_id, JSON.stringify(req.body.state))
        .then(() => {
          res.send({ message: '更新历史成功' });
        }).catch((err) =>{
          res.status(500).send({ error: '更新播放历史失败，服务器错误' });
          console.error(err);
        })
});

// 删除播放历史，适用于当前场景下，某些文件被删除后，作品只有一个文件，无法播放正确文件的bug
router.delete('/',
  body('work_id').isInt(),
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    let username = config.auth ? req.user.name : 'admin';
    try {
      await db.deletePlayHistroy(username, req.body.work_id);
      res.send({message: '删除历史记录成功'});
    } catch (err) {
      console.error(err);
      next(err);
    }
});

module.exports = router;