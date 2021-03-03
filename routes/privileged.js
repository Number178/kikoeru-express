// This file is designated for dangerous routes which will trigger side effects
// such as opening folder on host system, shuting down the host system, etc.
const router = require('express').Router();
const { config } = require('../config');

// Validation middleware
router.use('/', (req, res, next) => {
  if (process.env.NODE_ENV === 'production' || config.production) {
    res.status(403).send({ error: '生产环境下禁止访问' });
    return next('router');
  }
  if (!config.enableUnsafeRoutes) {
    res.status(403).send({ error: '未启用不安全的路由，请检查设置' });
    return next('router');
  }
  if (process.env.IS_DOCKER) {
    res.status(500).send({ error: '不能在Docker版执行此操作' });
  }
  if (!config.auth) {
    res.status(403).send({ error: '必须开启用户验证才能执行此操作' });
    return next('router');
  }
  if (config.auth && req.user.name !== 'admin') {
    res.status(403).send({ error: '只有管理员用户才能执行此操作' });
    return next('router');
  }
  next();
});

// eslint-disable-next-line no-unused-vars
router.get('/host/folder/open', (req, res, next) => {

  console.log('GOT HERE');
  res.send({message: '已打开文件夹'});

  // if (!config.auth || req.user.name === 'admin') {
  //   db.knex('t_user')
  //   .select('name', 'group')
  //   .then((users) => {
  //     res.send({ users });
  //   })
  //   .catch((err) => {
  //     next(err);
  //   });
  // } else {
  //   res.status(401).send({ error: '只有 admin 账号能浏览用户.' });
  // }
});

module.exports = router;