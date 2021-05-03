const path = require('path');
const socket = require('socket.io');
const jwtAuth = require('socketio-jwt-auth'); // 用于 JWT 验证的 socket.io 中间件
const child_process = require('child_process'); // 子进程
const { config } = require('./config');

const initSocket = (server) => {
  const io = socket(server);
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

    socket.on('PERFORM_UPDATE', () => {
      if (!scanner) {
        scanner = child_process.fork(path.join(__dirname, './filesystem/updater.js'), ['--refreshAll'], { silent: false }); // 子进程
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
}

module.exports = initSocket;