const path = require('path');
const express = require('express');
const bodyParser = require('body-parser'); // 获取 req.body
const history = require('connect-history-api-fallback');
const http = require('http');
const jwtAuth = require('socketio-jwt-auth'); // 用于 JWT 验证的 socket.io 中间件
const child_process = require('child_process'); // 子进程
const { initApp }= require('./database/schema');

const { config } = require('./config');
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

// Serve WebApp routes
app.use(express.static(path.join(__dirname, './dist')));

const server = http.createServer(app);
// websocket 握手依赖 http 服务
const io = require('socket.io')(server);

if (config.auth) {
  io.use(jwtAuth.authenticate({
    secret: config.jwtsecret
  }, (payload, done) => {
    const user = {
      name: payload.name,
      group: payload.group
    };

    if (user.name === 'admin') {
      done(null, user);
    } else {
      done(null, false, '只有 admin 账号能登录管理后台.');
    }
  }));
}

let scanner = null;

// 有新的客户端连接时触发
io.on('connection', function (socket) {
  // console.log('connection');
  socket.emit('success', {
    message: '成功登录管理后台.',
    user: socket.request.user,
    auth: config.auth
  });

  // socket.on('disconnect', () => {
  //   console.log('disconnect');
  // });
  
  socket.on('ON_SCANNER_PAGE', () => {
    if (scanner) {
      // 防止用户在扫描过程中刷新页面
      scanner.send({
        emit: 'SCAN_INIT_STATE'
      });
    }
  });

  socket.on('PERFORM_SCAN', () => {
    if (!scanner) {
      scanner = child_process.fork(path.join(__dirname, './filesystem/scanner.js'), { silent: false }); // 子进程
      scanner.on('exit', (code) => {
        scanner = null;
        if (code) {
          io.emit('SCAN_ERROR');
        }
      });
      
      scanner.on('message', (m) => {
        if (m.event) {
          io.emit(m.event, m.payload);
        }
      });
    }   
  });

  socket.on('KILL_SCAN_PROCESS', () => {
    scanner.send({
      exit: 1
    });
  });

  // 发生错误时触发
  socket.on('error', (err) => {
    console.error(err);
  });
});

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

initApp().catch(err => console.error(err));

let listenPort = 8888;
if (config.listenPort) {
  listenPort = config.listenPort;
}
listenPort = process.env.PORT || listenPort;

server.listen(listenPort, () => {
  console.log(`Express listening on http://[::]:${listenPort}`)
});
