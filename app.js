const path = require('path');
const express = require('express');
const initSocket = require('./socket');
const compression = require('compression');
const bodyParser = require('body-parser'); // 获取 req.body
const history = require('connect-history-api-fallback');
const http = require('http');
const https = require('https');
const fs = require('fs');

const { initApp }= require('./database/schema');
const { config } = require('./config');
const api = require('./api');
const app = express();

// Initialize database if not exists 
// Init or migrate database and config
// Note: non-blocking
initApp().catch(err => console.error(err));

if (config.enableGzip) {
  app.use(compression());
}

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

// Serve WebApp routes
app.use(express.static(path.join(__dirname, './dist')));

// 返回错误响应
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') { 
    // 验证错误  
    res.status(401).send({ error: err.message });
  } else if (err.code === 'SQLITE_ERROR') {
    if (err.message.indexOf('no such table') !== -1) {
      res.status(500).send({ error: '数据库结构尚未建立，请先执行扫描.'});
    }
  } else {
    res.status(500).send({ error: err.message || err });
  }
});

// Create HTTP and HTTPS server
const server = http.createServer(app);
let httpsServer = null;
let httpsSuccess = false;
if (config.httpsEnabled) {
  try {
    httpsServer = https.createServer({
      key: fs.readFileSync(config.httpsPrivateKey),
      cert: fs.readFileSync(config.httpsCert),
    },app);
    httpsSuccess = true;
  } catch (err) {
    console.error('HTTPS服务器启动失败，请检查证书位置以及是否文件可读')
    console.error(err);
  }
}

// websocket 握手依赖 http 服务
initSocket(server);
if (config.httpsEnabled) {
  initSocket(httpsServer);
}

let listenPort = 8888;
if (config.listenPort) {
  listenPort = config.listenPort;
}
listenPort = process.env.PORT || listenPort;

server.listen(listenPort, () => {
  console.log(`Express listening on http://[::]:${listenPort}`)
});

if (config.httpsEnabled && httpsSuccess) {
  httpsServer.listen(config.httpsPort, () => {
    console.log(`Express listening on https://[::]:${config.httpsPort}`)
  });
}
