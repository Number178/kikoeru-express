const fs = require('fs');
const path = require('path');
const stringRandom = require('string-random');

const configFolderDir = process.pkg ? path.join(process.execPath, '..', 'config') : path.join(__dirname, 'config');
const configPath = path.join(configFolderDir, 'config.json');

const defaultConfig = {
  maxParallelism: 16,
  rootFolders: [
    // {
    //   name: '',
    //   path: ''
    // }
  ],
  coverFolderDir: process.pkg ? path.join(process.execPath, '..', 'covers') : path.join(__dirname, 'covers'),
  databaseFolderDir: process.pkg ? path.join(process.execPath, '..', 'sqlite') : path.join(__dirname, 'sqlite'),
  auth: false,
  md5secret: stringRandom(14),
  jwtsecret: stringRandom(14),
  expiresIn: 2592000,
  scannerMaxRecursionDepth: 2,
  pageSize: 12,
  tagLanguage: 'zh-cn',
  coverSource: 'DLite',
  retry: 5,
  timeout: 2000,
  retryDelay: 500,
  httpProxyHost: '',
  httpProxyPort: 0
};

const initConfig = () => fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, "\t"));

const setConfig = (newConfig) => fs.writeFileSync(configPath, JSON.stringify(newConfig, null, "\t"));

const getConfig = () => JSON.parse(fs.readFileSync(configPath));

if (!fs.existsSync(configPath)) {
  if (!fs.existsSync(configFolderDir)) {
    try {
      fs.mkdirSync(configFolderDir, { recursive: true });
    } catch(err) {
      console.error(` ! 在创建存放配置文件的文件夹时出错: ${err.message}`);
    }
  }
  initConfig();
}


module.exports = {
  setConfig, getConfig
};
