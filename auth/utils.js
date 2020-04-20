const jwt = require('jsonwebtoken');
const md5 = require('md5');

const { getConfig } = require('../config');

const config = getConfig();

const signtoken = (obj) => jwt.sign(obj, config.jwtsecret, {expiresIn: config.expiresIn});

const cmd5 = (str) => md5(str + config.md5secret);


module.exports = {
  signtoken,
  md5: cmd5,
}
