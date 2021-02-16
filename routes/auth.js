const express = require('express');
const { check, validationResult } = require('express-validator'); // 后端校验
const expressJwt = require('express-jwt'); // 把 JWT 的 payload 部分赋值于 req.user

const { signtoken, md5 } = require('../auth/utils');
const db = require('../database/db');

const { config } = require('../config');

const router = express.Router();

// 用户登录
router.post('/me', [
  check('name')
    .isLength({ min: 5 })
    .withMessage('用户名长度至少为 5'),
  check('password')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5')
], (req, res, next) => {
  // Finds the validation errors in this request and wraps them in an object with handy functions
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).send({ errors: errors.array() });
  }

  const name = req.body.name;
  const password = req.body.password;

  db.knex('t_user')
    .where('name', '=', name)
    .andWhere('password', '=', md5(password))
    .first()
    .then((user) => {
      if (!user) {
        res.status(401).send({error: '用户名或密码错误.'});
      } else {
        const token = signtoken(user);
        res.send({ token });
      }
    })
    .catch((err) => {
      next(err);
    });
});

if (config.auth) {
  router.get('/me', expressJwt({ secret: config.jwtsecret, algorithms: ['HS256'] }));
}

// 获取用户信息
// eslint-disable-next-line no-unused-vars
router.get('/me', (req, res, next) => {
  // 同时告诉客户端，服务器是否启用用户验证
  const auth = config.auth;
  const user = config.auth
    ? { name: req.user.name, group: req.user.group }
    : { name: 'admin', group: 'administrator' }
  res.send({ user, auth });
});

module.exports = router;
