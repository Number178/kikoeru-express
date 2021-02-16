const express = require('express');
const router = express.Router();
const { config, updateLock } = require('../config');
const axios = require('axios');
const pjson = require('../package.json');
const compareVersions = require('compare-versions');

// eslint-disable-next-line no-unused-vars
router.get('/', (req, res, next) => {
  const lockReason = '新版解决了旧版扫描时将かの仔和こっこ识别为同一个人的问题，建议进行扫描以自动修复这一问题'
  
  axios.get('https://api.github.com/repos/umonaca/kikoeru-express/releases/latest')
    .then(function (response) {
      if (response.data && response.data.tag_name) {
        const current = pjson.version;
        const latest_stable = response.data.tag_name;
        const newVerAvailable = compareVersions.compare(latest_stable, current, '>')
        res.send({
          current: current,
          latest_stable: latest_stable,
          update_available: newVerAvailable,
          notifyUser: config.checkUpdate,
          lockFileExists: updateLock.isLockFilePresent,
          lockReason: updateLock.isLockFilePresent ? lockReason : null
        });
      } else {
        // Empty result or no tag
        res.send({
          current: pjson.version,
          latest_stable: null,
          update_available: false,
          notifyUser: config.checkUpdate,
          lockFileExists: updateLock.isLockFilePresent,
          lockReason: updateLock.isLockFilePresent ? lockReason : null
        });
      }
    })
    .catch(function () {
      const current = pjson.version;
      // In case API rate limit is hit
      res.send({
        current: current,
        latest_stable: null,
        update_available: false,
        notifyUser: config.checkUpdate,
        lockFileExists: updateLock.isLockFilePresent,
        lockReason: updateLock.isLockFilePresent ? lockReason : null
      });
      // next(error);
    })
});

module.exports = router;