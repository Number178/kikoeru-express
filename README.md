# Kikoeru
一个同人音声专用的音乐流媒体服务器

### 功能介绍
- 从 DLSite 爬取音声元数据
- 通过标签或关键字快速检索想要找到的音声
- 根据音声元数据对检索结果进行排序
- 可以选择通过 JWT 验证用户或关闭用户认证功能
- 支持在 Web 端修改配置文件和扫描音声库
- 支持为音声库添加多个根文件夹

### 安装部署
```bash
# 安装依赖
npm install

# 启动服务器
npm start

# Express listening on http://localhost:8888
```

### 技术栈
- axios (网络请求)
- express (构建后端服务)
- sqlite3 (文件型数据库)
- knexjs (操作数据库)
- cheerio (将 html 解析为 jQuery 对象)
- jsonwebtoken (用户认证)
- socket.io (用于将扫描音声库的结果实时传给客户端)
- child_process (nodejs 子进程)
- pkg (打包为可执行文件)


### 项目目录结构
```
├── auth/                    # 用户认证相关路由
├── config/                  # 存放配置文件
├── covers/                  # 存放音声封面
├── database/                # 操作数据库相关代码
├── dist/                    # 存放前端项目构建的 SPA
├── filesystem/              # 存放用于执行扫描的相关代码
├── package/                 # 存放通过 pkg 打包后的可执行文件
├── scraper/                 # 存放爬虫相关代码
├── sqlite/                  # 存放 sqlite 数据库文件
├── static/                  # 存放静态资源
├── .gitignore               # git 忽略路径
├── api.js                   # 为 express 实例添加路由与 jwt 验证中间件
├── app.js                   # 项目入口文件
├── config.js                # 用于生成与修改 config.json 配置文件
├── Dockerfile               # 用于构建 docker 镜像的文本文件
├── package.json             # npm 脚本和依赖项
└── routes.js                # 主要路由
```


### TODO
- [ ] 添加计划任务，定期更新音声的动态元数据
- [ ] 允许用户手动修改音声元数据
- [ ] 爬取音声的简介信息
- [ ] 添加收藏夹功能
- [ ] 添加保存歌单功能

### 感谢
本项目的大部分后端代码来自于开源项目 [kikoeru](https://github.com/nortonandrews/kikoeru)