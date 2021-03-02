# Kikoeru
一个同人音声专用的音乐流媒体服务器，详细的使用说明见[**用户文档**](./%E7%94%A8%E6%88%B7%E6%96%87%E6%A1%A3.md)

![截图.png](https://i.loli.net/2020/04/22/hjXW4PdsaoIt97U.png)

### 功能介绍
- 从 DLSite 爬取音声元数据
- 对音声标记进度、打星、写评语
- 通过标签或关键字快速检索想要找到的音声
- 根据音声元数据对检索结果进行排序
- 可以选择通过 JWT 验证用户或关闭用户认证功能
- 支持在 Web 端修改配置文件和扫描音声库
- 支持为音声库添加多个根文件夹

### 源码安装部署
将kikoeru-quasar项目生成的SPA或PWA文件夹全部文件置于`dist`文件夹下，确保`dist/index.html`存在，然后：
```bash
# 安装依赖
npm install

# 启动服务器
npm start

# Express listening on http://[::]:8888
```
关于选择PWA还是SPA：  
区别仅仅在于有无Service Worker，由于Service Worker只能在本地和HTTPS上运行，因此如果远程以HTTP方式打开，PWA和SPA二者没有任何区别。也就是说，如果Kikoeru的主要用途是在移动设备上局域网播放，并且您没有配置HTTPS证书，那么实际上打开的都是SPA。  
PWA的优点：基本页面零延迟，可以像手机APP一样通过浏览器“添加到桌面”的方式安装成App。作者自己使用的前端版本。  
缺点：更新新版本时需要至少多刷新一次。  

本项目还有打包好的 **Windows 系统下可用的 exe 可执行文件**与 **docker 镜像**版本，docker镜像及docker-compose的使用说明详见[**用户文档**](./%E7%94%A8%E6%88%B7%E6%96%87%E6%A1%A3.md)  
使用docker-compose只需调整`docker-compose.yml`内的挂载位置以符合您的存储路径即可。

### 技术栈
- axios (网络请求)
- express (构建后端服务)
- sqlite3 (文件型数据库)
- knexjs (操作数据库)
- knex-migrate (数据库迁移)
- cheerio (将 html 解析为 jQuery 对象)
- jsonwebtoken (用户认证)
- socket.io (用于将扫描音声库的结果实时传给客户端)
- lrc-file-parser (解析播放LRC歌词文件)
- jschardet (判断文本文件编码)
- child_process (nodejs 子进程)
- pkg (打包为可执行文件)


### 项目目录结构
```
├── routes/                  # 主要路由
├── config/                  # 存放配置文件
├── covers/                  # 存放音声封面
├── database/                # 操作数据库相关代码
├── dist/                    # 存放前端项目 kikoeru-quasar 构建的 PWA
├── filesystem/              # 存放扫描相关代码
├── package/                 # 存放 pkg 打包后的可执行文件
├── package-macos/           # 存放 pkg 打包后的可执行文件
├── scraper/                 # 存放爬虫相关代码
├── sqlite/                  # 存放 sqlite 数据库文件
├── static/                  # 存放静态资源
├── .gitignore               # git 忽略路径
├── .dockerignore            # Docker 忽略路径
├── api.js                   # 为 express 实例添加路由与 jwt 验证中间件
├── app.js                   # 项目入口文件
├── socket.js                # 用于初始化socket.io
├── config.js                # 用于生成与修改 config.json 配置文件，导出公共配置以及升级锁
├── Dockerfile               # 用于构建 docker 镜像的文本文件
├── docker-compose.yml       # 用于使用docker-compose一键构建环境
├── package.json             # npm 脚本和依赖项
├── eslintrc.json            # ESLint
├── Changelog.md             # 最近的版本历史
```


### TODO
- [x] 可拖动歌词控件
- [x] 二级页面返回按钮
- [x] 手动星标
- [x] 评价过的作品优先
- [x] 星标前端 CRUD
- [x] 星标后端 CRUD
- [x] 进度标记页面
- [x] 用户评价
- [x] 修复面条代码里的placeholders
- [x] 升级sqlite等
- [x] 刷新元数据
- [x] 不清理作品
- [x] 修复扫描阻塞
- [ ] 使用ID标识文件夹
- [x] 整理路由等
- [ ] 单元测试、CI
- [ ] Insersection Observer
- [ ] 可编辑标签
- [ ] 重新扫描
- [ ] Dark Mode
- [ ] 重构WorkCard和WorkDetail
- [ ] 使用vuex重构收藏
- [x] 检查启用foreign key是否会出错
- [ ] 导入导出评价、进度
- [ ] 重构config和schema，添加多用户支持（目前实际上仍然是单用户架构）
- [ ] 重构鉴权逻辑, cookie, CSRF, 不向管理员传递md5 salt...
- [x] Knex error catch
- [x] 写迁移脚本
- [x] 重写创建数据库逻辑（与迁移脚本冲突了）
- [ ] 播放列表功能（目前只有一个）
- [ ] docker适当的权限与进程监控
- [ ] 添加计划任务，定期更新音声的动态元数据
- [ ] 手动添加音声
- [x] 首次扫描bug
- [x] 扫描设置

### 感谢
本项目的大部分后端代码来自于开源项目 [kikoeru](https://github.com/nortonandrews/kikoeru)

### 声明
本项目作为开源软件，本身不包含任何版权内容或其它违反法律的内容。项目中的程序是为了个人用户管理自己所有的合法数据资料而设计的。  
程序作者并不能防止内容提供商（如各类网站）或其它用户使用本程序提供侵权或其它非法内容。程序作者与使用本程序的各类内容提供商并无联系，不为其提供技术支持，也不为其不当使用承担法律责任。

### 许可协议
GNU General Public License v3.0
