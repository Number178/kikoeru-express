const path = require('path');
const express = require('express');
const bodyParser = require('body-parser'); // 获取 req.body
const history = require('connect-history-api-fallback');

const api = require('./api');

const app = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));
// parse application/json
app.use(bodyParser.json());

// connect-history-api-fallback 中间件后所有的 GET 请求都会变成 index (default: './index.html').
app.use(history({
  // 将所有带 api 的 GET 请求都代理到 parsedUrl.path, 其实就是原来的路径
  rewrites: [
    {
      from: /^\/api\/.*$/,
      to: context => context.parsedUrl.path
    }
  ]
}));
// Expose API routes
api(app);

// 返回验证错误
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {   
    res.status(401).send(err);
  }
});

// Serve WebApp routes
app.use(express.static(path.join(__dirname, './dist')));

// Start server
app.listen(process.env.PORT || 8888, () => {
  console.log(`Express listening on http://localhost:${process.env.PORT || 8888}`)
});
