const express = require('express');
const { check, validationResult } = require('express-validator'); // 后端校验
const expressJwt = require('express-jwt'); // 把 JWT 的 payload 部分赋值于 req.user

const { signtoken, md5 } = require('./utils');
const db = require('../database/db');

const config = require('../config.json');

const router = express.Router();

// 用户登录
router.post('/me', [
  check('name')
    .isLength({ min: 4 })
    .withMessage('用户名长度至少为 4'),
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
        res.send({error: '用户名或密码错误.'});
      } else {
        const token = signtoken(user);
        res.send({ token });
      }
    })
    .catch((err) => {
      next(err);
    });
});

// 获取用户信息
router.get('/me', expressJwt({ secret: config.jwtsecret }), (req, res, next) => {
  const user = {
    name: req.user.name,
    group: req.user.group
  }
  res.send({ user });
});

// expressJwt 中间件 
// 验证指定 http 请求的 JsonWebTokens 的有效性, 如果有效就将 JsonWebTokens 的值设置到 req.user 里面, 然后路由到相应的 router
router.use('/user', expressJwt({ secret: config.jwtsecret }));

// 创建一个新用户 (仅管理员用户组拥有权限)
router.post('/user', [
  check('name')
    .isLength({ min: 4 })
    .withMessage('用户名长度至少为 4'),
  check('password')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5'),
  check('group')
    .custom(value => {
      if (value !== 'administrator' && value !== 'user' && value !== 'gaust') {
        throw new Error('用户组名称必须为 (administrator, user, gaust) 的一个.')
      }
      return true
    })
], (req, res, next) => {
  // Finds the validation errors in this request and wraps them in an object with handy functions
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).send({ errors: errors.array() });
  }

  const user = {
    name: req.body.name,
    password: req.body.password,
    group: req.body.group
  }

  if (req.user.group === 'administrator') {
    db.createUser({
      name: user.name,
      password: md5(user.password),
      group: user.group
    })
      .then(() => res.send({ user }))
      .catch((err) => {
        if (err.message.indexOf('用户已存在') !== -1) {
          res.send({ error: `用户 ${user.name} 已存在.` });
        } else {
          next(err);
        }
      }); 
  } else {
    res.send({ error: '当前用户所在用户组权限不足.' });
  }
});

// 更新用户
router.put('/user', [
  check('oldName')
    .isLength({ min: 4 })
    .withMessage('用户名至少为 4'),
  check('oldPassword')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5'),
  check('newName')
    .isLength({ min: 4 })
    .withMessage('用户名长度至少为 4'),
  check('newPassword')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5')
], (req, res, next) => {
  // Finds the validation errors in this request and wraps them in an object with handy functions
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({errors: errors.array()});
  }

  const oldUser = {
    name: req.body.oldName,
    password: req.body.oldPassword,
  }

  const newUser = {
    name: req.body.newName,
    password: req.body.newPassword,
  }
  
  db.updateUser(oldUser, newUser)
    .then(() => res.send({ user: newUser }))
    .catch((err) => {
      if (err.message.indexOf('用户名或密码错误.') !== -1) {
        res.send({ error: '用户名或密码错误.' });
      } else {
        next(err);
      }
    });   
});

// 删除用户 (仅管理员用户组拥有权限)
router.delete('/user', (req, res, next) => {
  const user = {
    name: req.body.name
  }

  if (req.user.group === 'administrator') {
    if (user.name !== 'admin') {
      db.deleteUser(user)
        .then((resault) => {
          (resault > 0)
            ? res.send({ user })
            : res.send({ error: `用户 ${user.name} 不存在.` })
        })
        .catch((err) => {
          next(err);
        });
    } else {
      res.send({ error: '不能删除内置的管理员账号.' });
    }
  } else {
    res.send({ error: '当前用户所在用户组权限不足.' });
  }
});


module.exports = router;
