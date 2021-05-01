const jwt = require('jsonwebtoken');
const md5 = require('md5');

const { config } = require('../config');

const issuer = 'http://kikoeru'
const audience = 'http://kikoeru/api'


const signPayload = (payload) => jwt.sign(payload, config.jwtsecret, {expiresIn: config.expiresIn});

const signToken = (user) => {
  // RFC 7519
  const payload = {
    iss: issuer,
    sub: user.name,
    aud: audience,
    name: user.name,
    group: user.group
  }
  return signPayload(payload)
}

const cmd5 = (str) => md5(str + config.md5secret);



module.exports = {
  signToken,
  md5: cmd5,
  issuer,
  audience
}
