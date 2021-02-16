const express = require('express');
const router = express.Router();
const { config, setConfig, sharedConfigHandle } = require('../config');

// 修改配置文件
router.put('/admin', (req, res, next) => {
  if (!config.auth || req.user.name === 'admin') {
    try {
      setConfig(req.body.config);
      res.send({ message: '保存成功.' })
    } catch(err) {
      next(err);
    }
  } else {
    res.status(401).send({ error: '只有 admin 账号能修改配置文件.' });
  }
});

// 获取配置文件
router.get('/admin', (req, res, next) => {
  if (!config.auth || req.user.name === 'admin') {
    try {
      res.send({ config: config });
    } catch(err) {
      next(err);
    }
  } else {
    res.status(401).send({ error: '只有 admin 账号能读取管理配置文件.' });
  }
});

router.get('/shared', (req, res, next) => {
  try {
    res.send({ sharedConfig: sharedConfigHandle.export() });
  } catch(err) {
    next(err);
  }
});

module.exports = router;