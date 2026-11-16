const _ = require('lodash'); 
const express = require('express');
const router = express.Router();
const { config, setConfig, sharedConfigHandle } = require('../config');
const { getWritebackConfig, hashWritebackKey, validWritebackKey } = require('../auth/kikoetaWriteback');

const isAdmin = req => config.auth && req.user && req.user.name === 'admin';

function writebackStatus(req) {
  if (config.auth && !isAdmin(req)) return null;
  const { enabled, keyHash, authMode } = getWritebackConfig(config);
  return { enabled, hasKey: Boolean(keyHash), authMode };
}

const filterConfig = (_config, option = 'read') => {
  const currentConfig = config;
  const configClone = _.cloneDeep(_config);
  delete configClone.md5secret;
  delete configClone.jwtsecret;
  delete configClone.kikoetaWritebackEnabled;
  delete configClone.kikoetaWritebackKeyHash;
  delete configClone.kikoetaWritebackAuth;
  if (option === 'write') {
    delete configClone.production;
    if (process.env.NODE_ENV === 'production' || currentConfig.production) {
      delete configClone.auth;
    }
  }
  return configClone;
}

// 修改配置文件
router.put('/admin', (req, res, next) => {
  if (!config.auth || isAdmin(req)) {
    try {
      // Note: setConfig uses Object.assign to merge new configs
      const newConfig = filterConfig(req.body.config, 'write');
      if (Object.prototype.hasOwnProperty.call(req.body, 'kikoetaWriteback')) {
        // The enclosing route already applies the existing dashboard permissions.
        if (config.auth && !isAdmin(req)) return res.status(403).send({ error: '只有 admin 账号能修改写回设置。' });
        const { enabled, key = '', authMode = key ? 'account_and_key' : getWritebackConfig(config).authMode } = req.body.kikoetaWriteback || {};
        if (!['account', 'account_and_key'].includes(authMode)) {
          return res.status(400).send({ error: '请选择有效的写回验证方式。' });
        }
        if (typeof enabled !== 'boolean' || (key !== '' && !validWritebackKey(key))) {
          return res.status(400).send({ error: '写回密钥必须是 16 位英文字母或数字。' });
        }
        const keyHash = key ? hashWritebackKey(key) : getWritebackConfig(config).keyHash;
        newConfig.kikoetaWritebackEnabled = enabled;
        newConfig.kikoetaWritebackKeyHash = keyHash;
        newConfig.kikoetaWritebackAuth = authMode;
      }
      const nextConfig = { ...config, ...newConfig };
      const writeback = getWritebackConfig(nextConfig);
      if (nextConfig.auth && writeback.enabled && writeback.authMode === 'account_and_key' && !writeback.keyHash) {
        return res.status(400).send({ error: '请设置 16 位写回密钥，或关闭密钥验证。' });
      }
      setConfig(newConfig);
      res.send({ message: '保存成功.', kikoetaWriteback: writebackStatus(req) });
    } catch(err) {
      next(err);
    }
  } else {
    res.status(403).send({ error: '只有 admin 账号能修改配置文件.' });
  }
});

// 获取配置文件
router.get('/admin', (req, res, next) => {
  if (!config.auth || isAdmin(req)) {
    try {
      res.send({ config: filterConfig(config, 'read'), kikoetaWriteback: writebackStatus(req) });
    } catch(err) {
      next(err);
    }
  } else {
    res.status(403).send({ error: '只有 admin 账号能读取管理配置文件.' });
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
