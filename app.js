const path = require('path');
const express = require('express');
const history = require('connect-history-api-fallback');

const routes = require('./routes');

const app = express()
// connect-history-api-fallback 中间件后所有的 GET 请求都会变成 index (default /index.html).
app.use(history({
  // 将所有带 api 的 GET 请求都代理到 parsedUrl.path, 其实就是原来的路径
  rewrites: [
    {
      from: /^\/api\/.*$/,
      to: function (context) {
        return context.parsedUrl.path
      }
    }
  ]
}));
// Expose API routes
app.use('/api', routes);
// Serve WebApp routes
app.use(express.static(path.join(__dirname, './dist')));

// Start server
app.listen(process.env.PORT || 8888, () => {
  console.log(`Express listening on http://localhost:${process.env.PORT || 8888}`)
});
