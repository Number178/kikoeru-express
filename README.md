# Kikoeru
一个同人音声专用的音乐流媒体服务器，详细的使用说明见[**用户文档**](https://github.com/umonaca/kikoeru-express/wiki/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E)

# iOS客户端
TestFlight：[KikoeruApp](https://number17.online/docs/kikoeru-app/)

[![unstable build status](https://github.com/umonaca/kikoeru-express/actions/workflows/build-artifacts.yml/badge.svg)](https://github.com/umonaca/kikoeru-express/actions)

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

本项目还有打包好的 **Windows 系统下可用的 exe 可执行文件**与 **docker 镜像**版本，docker镜像及docker-compose的使用说明详见[**用户文档**](https://github.com/umonaca/kikoeru-express/wiki/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E)  
使用docker-compose只需调整`docker-compose.yml`内的挂载位置以符合您的存储路径即可。

### Kikoeta 翻译歌词写回

在「高级设置 → Kikoeta Transl 歌词写回」开启「保存到音轨目录」并保存。用户验证关闭时，无需账号或密钥。用户验证开启时，「密钥验证」默认关闭，`user` 和管理员（`administrator`）角色登录后即可写回。

需要额外验证时，由 `admin` 开启「密钥验证」，配置 16 位英文字母或数字组成的密钥，并在 Kikoeta 自建站设置中填写相同的值，区分大小写。已有密钥的配置和旧环境变量设置会继续使用额外密钥验证，不会因升级自动放宽权限。切换写回验证方式立即生效，切换全局用户验证后仍需按原有流程重启服务。关闭全局用户验证不会清除已保存的写回验证方式或密钥。跨公网连接请使用 HTTPS。

Kikoeta 会自动检查站点的写回能力，只在需要时展开密钥输入。可点「检查写回权限」重新检查，检查不会创建测试文件，音轨目录的写入权限以实际保存结果为准。较旧的服务端继续使用原有能力探测。新服务端保留原有上传接口与密钥请求头。

可点「生成」填入随机密钥，用眼睛按钮切换显示或隐藏。保存前请复制密钥。网页设置保存在服务端配置中，密钥只保存校验摘要。首次保存写回设置前，兼容原有 `KIKOERU_KIKOETA_WRITEBACK` 和 `KIKOERU_KIKOETA_WRITEBACK_KEY` 环境变量。网页保存后，以保存的配置为准。

构建网页时，在 `kikoeru-quasar` 的公开 `alpha` 提交 `f3ab74b` 上用 `git apply --ignore-space-change <补丁路径>` 应用 [管理页补丁](patches/kikoeru-quasar-writeback-settings.patch)，再按原有流程将 SPA 或 PWA 构建产物放入 `dist`。单二进制构建使用同一份 `dist`。

验证通过后，Kikoeta 完成翻译并保存本地歌词时，也会尝试把 LRC 写到音轨旁，例如 `音轨.mp3.kikoeta.lrc`。刷新作品页面后，Kikoeru 可通过原有的歌词查询找到它。已有同名写回文件会保留，已有匹配歌词也仍优先播放。

写回成功后，作品标记为 AI 歌词。已有普通本地歌词时使用组合状态。重新扫描也会区分 `.kikoeta.lrc` 和普通歌词文件。

写回时按任务的原始站点读取最新登录凭据，切换播放器站点不会改变任务目标。认证或保存失败时，任务日志会说明原因，已完成的批次可点「重试写回」，直接使用本地歌词再次上传，无需重新翻译。重试记录保留在当前客户端会话中。

Kikoeta 的「同步 Transl 缓存」也会尝试写回。新缓存按记录的原站点匹配，旧缓存需要手动选择目标站点；仅对已配置的自建站、可精确匹配的音轨和原生媒体地址执行写回。未匹配或验证失败的歌词仍导入本地。需要更新 Kikoeta 客户端和 Transl 引擎，服务端沿用同一写回接口与验证设置。

写回要求使用该站的原生媒体 URL，且 Kikoeru 对音轨所在的文件系统有写入和创建硬链接的权限。外链、音轨已移除、写入失败或服务端未启用时，歌词仍可从 Kikoeta 本地歌词库和 Transl 的原有结果入口使用。

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
