const routes = require('./routes')
const expressJwt = require('express-jwt'); // 把 JWT 的 payload 部分赋值于 req.user

const { config } = require('./config');

/**
 * Get token from header or query string.
 */
const getToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
      return req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}


module.exports = (app) => {
  if (config.auth) {
    // expressJwt 中间件 
    // 验证指定 http 请求的 JsonWebTokens 的有效性, 如果有效就将 JsonWebTokens 的值设置到 req.user 里面, 然后路由到相应的 router
    app.use('/api', expressJwt({ secret: config.jwtsecret, getToken, algorithms: ['HS256'] }).unless({ path: ['/api/auth/me', '/api/health'] }));
  }

  app.use('/api', routes);
};