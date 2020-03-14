# kikoeru-express

#### 下载 kikoeru

下载 [kikoeru.rar](https://github.com/Watanuki-Kimihiro/kikoeru-express/releases) 并解压

#### 下载并解压 dist 文件

下载 [spa.rar](https://github.com/Watanuki-Kimihiro/kikoeru-quasar/releases) 并在 kikoeru/dist 文件夹内解压

#### 配置文件

```json
// config.json
{
  "maxParallelism": 16, // 爬取元数据时并行任务数量
  "rootDir": "G:/催眠音声", // 音声库的绝对路径
  // 注意: 在 Windows 资源管理器中复制得到的路径中的斜杠均为反斜杠("\"),
  // 需要把其路径中的反斜杠替换为正斜杠("/")
  "scannerMaxRecursionDepth": 2, // 最大递归扫描深度
  "worksPerPage": 12, // 单页音声数量
  "tagLanguage": "zh-cn", 
  // 标签元数据的语言，默认简体中文("zh-cn")
  // 可选参数有: "ja-jp"、"zh-tw"、或 "en-us"
  "coverSource": "DLite", // 封面图片源
  // 默认从 DLsite 下载封面图片, 可选参数有: "HVDB"
  "retry": 5, // axios 请求重试次数
  "timeout": 2000, // axios 请求超时时间 (毫秒)
  "retryDelay": 500, // 请求重试延迟 (毫秒)
  "httpProxyHost": false,
  // http 代理服务器地址
  // (为 false 时默认为本地主机)
  "httpProxyPort": 10809
  // http 代理服务端口号
  // (为 false 时不启用 http 代理)
}
```


#### 安装依赖

```
npm install
```

#### 扫描音声库

```
npm run scan
```

#### 启动服务

```
npm start
```

#### 访问 web 应用

[http://localhost:8888/](http://localhost:8888/)