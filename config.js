const fs = require('fs');
const path = require('path');
const crypto = require('crypto')

const configFolderDir = process.pkg ? path.join(process.execPath, '..', 'config') : path.join(__dirname, 'config');
const configPath = path.join(configFolderDir, 'config.json');
const pjson = require('./package.json');
const compareVersions = require('compare-versions');

// Before the following version, there is no version tracking
const versionWithoutVerTracking = '0.4.1';
// Before the following version, db path is using the absolute path in databaseFolderDir of config.json
const versionDbRelativePath = '0.5.8';

let config = {};

const voiceWorkDefaultPath = () => {
  if (process.env.IS_DOCKER) {
    return '/usr/src/kikoeru/VoiceWork';
  } else if (process.pkg) {
    return path.join(process.execPath, '..', 'VoiceWork');
  } else {
    return path.join(__dirname, 'VoiceWork');
  }
}

const defaultConfig = {
  version: pjson.version,
  production: process.env.NODE_ENV === 'production' ? true : false,
  checkUpdate: true,
  checkBetaUpdate: false,
  maxParallelism: 16,
  rootFolders: [
    // {
    //   name: '',
    //   path: ''
    // }
  ],
  coverFolderDir: process.pkg ? path.join(process.execPath, '..', 'covers') : path.join(__dirname, 'covers'),
  databaseFolderDir: process.pkg ? path.join(process.execPath, '..', 'sqlite') : path.join(__dirname, 'sqlite'),
  coverUseDefaultPath: false, // Ignores coverFolderDir if set to true
  dbUseDefaultPath: true, // Ignores databaseFolderDir if set to true
  voiceWorkDefaultPath: voiceWorkDefaultPath(),
  auth: process.env.NODE_ENV === 'production' ? true : false,
  md5secret: crypto.randomBytes(32).toString('hex'),
  jwtsecret: crypto.randomBytes(32).toString('hex'),
  expiresIn: 2592000,
  scannerMaxRecursionDepth: 2,
  pageSize: 12,
  tagLanguage: 'zh-cn',
  retry: 5,
  dlsiteTimeout: 10000,
  hvdbTimeout: 10000,
  retryDelay: 2000,
  httpProxyHost: '',
  httpProxyPort: 0,
  listenPort: 8888,
  blockRemoteConnection: false,
  behindProxy: false,
  httpsEnabled: false,
  httpsPrivateKey: 'kikoeru.key',
  httpsCert: 'kikoeru.crt',
  httpsPort: 8443,
  skipCleanup: false,
  enableGzip: true,
  rewindSeekTime: 5,
  forwardSeekTime: 30,
  enableUnsafeRoutes: false,
  offloadMedia: false,
  offloadStreamPath: '/media/stream/',
  offloadDownloadPath: '/media/download/'
};

const initConfig = () => {
  config = Object.assign(config, defaultConfig);
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, "\t"));
}

const setConfig = (newConfig) => {
  // Prevent changing some values, overwrite with old ones
  newConfig.production = config.production;
  if (process.env.NODE_ENV === 'production' || config.production) {
    newConfig.enableUnsafeRoutes = false;
    newConfig.auth = true;
  }
  newConfig.md5secret = config.md5secret;
  newConfig.jwtsecret = config.jwtsecret;

  // Merge config
  config = Object.assign(config, newConfig);
  fs.writeFileSync(configPath, JSON.stringify(config, null, "\t"));
}

// Get or use default value
const getConfig = () => {
  config = JSON.parse(fs.readFileSync(configPath));
  for (let key in defaultConfig) {
    if (!config.hasOwnProperty(key)) {
      if (key === 'version') {
        config['version'] = versionWithoutVerTracking;
      } else {
        config[key] = defaultConfig[key];
      }
    }
  }

  // Support reading relative path
  // When config is saved in admin panel, it will still be stored as absolute path 
  if(!path.isAbsolute(config.coverFolderDir)) {
    config.coverFolderDir = process.pkg ? path.join(process.execPath, '..', config.coverFolderDir) : path.join(__dirname, config.coverFolderDir);
  }
  if(!path.isAbsolute(config.databaseFolderDir)) {
    config.databaseFolderDir = process.pkg ? path.join(process.execPath, '..', config.databaseFolderDir) : path.join(__dirname, config.databaseFolderDir);
  }

  // Use ./covers and ./sqlite to override settings, ignoring corresponding fields in config
  if (config.coverUseDefaultPath) {
    config.coverFolderDir = process.pkg ? path.join(process.execPath, '..', 'covers') : path.join(__dirname, 'covers');
  }
  if (config.dbUseDefaultPath) {
    config.databaseFolderDir = process.pkg ? path.join(process.execPath, '..', 'sqlite') : path.join(__dirname, 'sqlite');
  }

  // Disable unsafe routes for production environment
  if (process.env.NODE_ENV === 'production' || config.production) {
    config.enableUnsafeRoutes = false;
    config.auth = true;
  }
};

// Migrate config
const updateConfig = () => {
  let cfg = JSON.parse(fs.readFileSync(configPath));
  let countChanged = 0;
  for (let key in defaultConfig) {
    if (!cfg.hasOwnProperty(key)) {
      console.log('写入设置', key);
      cfg[key] = defaultConfig[key];
      countChanged += 1;
    }
  }

  if (compareVersions.compare(cfg.version, versionDbRelativePath, '<')) {
    console.log('数据库位置已设置为程序目录下的sqlite文件夹');
    console.log('如需指定其它位置，请阅读0.6.0-rc.0更新说明');
  }


  if (countChanged || cfg.version !== pjson.version) {
    cfg.version = pjson.version;
    setConfig(cfg)
  }
}

class publicConfig {
  get rewindSeekTime() {
    return config.rewindSeekTime;
  }
  get forwardSeekTime() {
    return config.forwardSeekTime;
  }
  export() {
    return {
      rewindSeekTime: this.rewindSeekTime,
      forwardSeekTime: this.forwardSeekTime
    }
  }
}

const sharedConfigHandle = new publicConfig();

// This part always runs when the module is initialized
if (!fs.existsSync(configPath)) {
  if (!fs.existsSync(configFolderDir)) {
    try {
      fs.mkdirSync(configFolderDir, { recursive: true });
    } catch(err) {
      console.error(` ! 在创建存放配置文件的文件夹时出错: ${err.message}`);
    }
  }
  initConfig();
} else {
  getConfig();
}

module.exports = {
  setConfig, updateConfig, config, sharedConfigHandle, configFolderDir
};
