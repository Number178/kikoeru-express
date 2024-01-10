const fs = require('fs');
const path = require('path');
const recursiveReaddir = require('recursive-readdir');
const { orderBy } = require('natural-orderby');
const { joinFragments } = require('../routes/utils/url');
const { config } = require('../config');

const supportedMediaExtList = ['.mp3', '.ogg', '.opus', '.wav', '.aac', '.flac', '.webm', '.mp4', '.m4a', '.mka'];
const supportedSubtitleExtList = ['.lrc', '.srt', '.ass', ".vtt"]; // '.ass' only support show on file list, not for play lyric
const supportedImageExtList = ['.jpg', '.jpeg', '.png', '.webp'];

const LimitPromise = require('limit-promise'); // 限制并发数量
const limitP = new LimitPromise(config.maxParallelism); // 核心控制器
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const execFile = util.promisify(require('child_process').execFile);

async function getAudioFileDuration(filePath) {
  try {
    // 默认环境中已经安装了ffprobe命令
    const { stdout } = await execFile('ffprobe', [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const durationSecs = parseFloat(stdout);
    return durationSecs;
  } catch (err) {
    console.error(`get duration failed, file = ${filePath}`, err);
  }
  return NaN;
}
const getAudioFileDurationLimited = (filePath) => limitP.call(getAudioFileDuration, filePath);

// 是否包含字幕
// @param {String} dir Work directory (absolute).
async function isContainLyric(dir) {
  console.log("isContainLyric check dir: ", dir)
  const files = await recursiveReaddir(dir);
  const lyricFiles = files.filter((file) => {
    const ext = path.extname(file).toLocaleLowerCase();
    return supportedSubtitleExtList.includes(ext);
  })
  console.log("isContainLyric check all files lenth = ", lyricFiles.length)
  return lyricFiles.length > 0;
}

// 从文件系统，抓取单个作品本地文件的杂项信息：
//  * 音频文件对应的时长
//  * TODO：文件hash
// work_id: number
// dir: string, absolute path
// return json object:
//  {
//    duration: {
//      'relative/path/to/audio1.mp3': 334.23, // seconds
//      'relative/path/to/audio2.mp3': 34.3, // seconds
//      'relative/directory/to/audio2.wav': 34.23, // seconds
//    }
//  }
async function scrapeWorkMemo(dir, oldMemo) {
  const files = await recursiveReaddir(dir)
  // Filter out any files not matching these extensions
  const oldMemoMtime = oldMemo.mtime || {};
  const oldMemoDuration = oldMemo.duration || {};
  const memo = { duration: {}, isContainLyric: false, mtime: {} };
  await Promise.all(files
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (supportedSubtitleExtList.includes(ext)) {
        memo.isContainLyric = true;
      }
      return supportedMediaExtList.includes(ext);
    }) // filter
    .map((file) => ({
        fullPath: file,
        shortPath: file.replace(path.join(dir, '/'), '')
      })
    ) // map
    .map(async (fileDict) => {
      const fstat = fs.statSync(fileDict.fullPath);
      const newMTime = Math.round(fstat.mtime.getTime());
      const oldMTime = oldMemoMtime[fileDict.shortPath];
      const oldDuration = oldMemoDuration[fileDict.shortPath];
      
      if (oldMTime === undefined // 音频文件是新增的
        || oldDuration === undefined // 此前没有更新过这个文件的duration
        || oldMTime !== newMTime // 或者音频文件的最后修改时间和之前的memo记录不一致，说明文件有修改
      ) { // 更新duration和mtime
        console.log(`update data on file: ${fileDict.fullPath}, fstate.mtime: ${fstat.mtime.getTime()}, `);
        memo.mtime[fileDict.shortPath] = newMTime;
        const duration = await getAudioFileDurationLimited(fileDict.fullPath);
        if (! isNaN(duration) && typeof(duration) === 'number') {
          memo.duration[fileDict.shortPath] = duration;
        }
      } else { // 使用老的文件信息
        memo.mtime[fileDict.shortPath] = oldMTime;
        memo.duration[fileDict.shortPath] = oldDuration;
      }
    }) // map get duration
  ); // Promise.all
  return memo;
}

/**
 * Returns list of playable tracks in a given folder. Track is an object
 * containing 'title', 'subtitle' and 'hash'.
 * @param {Number} id Work identifier. Currently, RJ/RE code.
 * @param {String} dir Work directory (absolute).
 * @param {readMemo} at least a empty object, or { duration: { "relative/path/audio.mp3": 33, "audio2.mp3": 22 }} for storage audio file duration
 */
const getTrackList = async function (id, dir, readMemo) {
  try {
    const files = await recursiveReaddir(dir)
    // Filter out any files not matching these extensions
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();

      return (
        supportedMediaExtList.includes(ext)
        || supportedSubtitleExtList.includes(ext)
        || supportedImageExtList.includes(ext)
        || ext === '.txt'
        || ext === '.pdf'
      );
    });

    // Sort by folder and title
    const sortedFiles = orderBy(filteredFiles.map((file) => {
      const shortFilePath = file.replace(path.join(dir, '/'), '');
      const dirName = path.dirname(shortFilePath);

      return {
        title: path.basename(file),
        subtitle: dirName === '.' ? null : dirName,
        ext: path.extname(file).toLowerCase(),
        fullPath: file, // 给后面获取音频时长提供文件的全路径
        shortFilePath,
      };
    }), [v => v.subtitle, v => v.title, v => v.ext]);

    // Add hash to each file
    const sortedHashedFiles = sortedFiles.map(
      (file, index) => ({
        title: file.title,
        subtitle: file.subtitle,
        hash: `${id}/${index}`,
        ext: file.ext,
        fullPath: file.fullPath, // 给后面获取音频时长提供文件的全路径
        shortFilePath: file.shortFilePath,
      }),
    );

    const durationMemo = readMemo.duration || { /* fallback */ };
    // add duration for each audio 
    const filesAddAudioDuration = await Promise.all(sortedHashedFiles.map(async (file) => {
      if (supportedMediaExtList.includes(file.ext) && (undefined !== durationMemo[file.shortFilePath])) {
        file.duration = durationMemo[file.shortFilePath];
      }
      // 移除fullPath信息
      delete file.fullPath;
      delete file.shortFilePath;

      return file;
    }));

    return filesAddAudioDuration;
  } catch (err) {
    console.log('getTracList error = ', err);
    throw new Error(`Failed to get tracklist from disk: ${err}`);
  }
}

/**
 * 转换成树状结构
 * @param {Array} tracks 
 * @param {String} workTitle 
 */
const toTree = (tracks, workTitle, workDir, rootFolder) => {
  const tree = [];

  // 插入文件夹
  tracks.forEach(track => {
    let fatherFolder = tree;
    const path = track.subtitle ? track.subtitle.split('\\') : [];
    path.forEach(folderName => {
      const index = fatherFolder.findIndex(item => item.type === 'folder' && item.title === folderName);
      if (index === -1) {
        fatherFolder.push({
          type: 'folder',
          title: folderName,
          children: []
        });
      }
      fatherFolder = fatherFolder.find(item => item.type === 'folder' && item.title === folderName).children;
    });
  });

  // 插入文件
  tracks.forEach(track => {
    let fatherFolder = tree;
    const paths = track.subtitle ? track.subtitle.split('\\') : [];
    paths.forEach(folderName => {
      fatherFolder = fatherFolder.find(item => item.type === 'folder' && item.title === folderName).children;
    });

    // Path controlled by config.offloadMedia, config.offloadStreamPath and config.offloadDownloadPath
    // If config.offloadMedia is enabled, by default, the paths are:
    // /media/stream/VoiceWork/RJ123456/subdirs/track.mp3
    // /media/download//VoiceWork/RJ123456/subdirs/track.mp3
    //
    // If the folder is deeper:
    // /media/stream/VoiceWork/second/RJ123456/subdirs/track.mp3
    // /media/download/VoiceWork/second/RJ123456/subdirs/track.mp3
    let offloadStreamUrl = joinFragments(config.offloadStreamPath, rootFolder.name, workDir, track.subtitle || '', track.title);
    let offloadDownloadUrl = joinFragments(config.offloadDownloadPath, rootFolder.name, workDir, track.subtitle || '', track.title);
    if (process.platform === 'win32') {
      offloadStreamUrl = offloadStreamUrl.replace(/\\/g, '/');
      offloadDownloadUrl = offloadDownloadUrl.replace(/\\/g, '/');
    }
  
    const textBaseUrl = '/api/media/stream/';
    const mediaStreamBaseUrl = '/api/media/stream/';
    const mediaDownloadBaseUrl = '/api/media/download/';
    const textStreamBaseUrl = textBaseUrl + track.hash;    // Handle charset detection internally with jschardet
    const textDownloadBaseUrl = config.offloadMedia ? offloadDownloadUrl : mediaDownloadBaseUrl + track.hash;
    const mediaStreamUrl = config.offloadMedia ? offloadStreamUrl : mediaStreamBaseUrl + track.hash;
    const mediaDownloadUrl = config.offloadMedia ? offloadDownloadUrl : mediaDownloadBaseUrl + track.hash;

    if (track.ext === '.txt' || track.ext === '.lrc' || track.ext === '.srt' || track.ext === '.ass' || track.ext === '.vtt') {
      fatherFolder.push({
        type: 'text',
        hash: track.hash,
        title: track.title,
        workTitle,
        mediaStreamUrl: textStreamBaseUrl,
        mediaDownloadUrl: textDownloadBaseUrl
      });
    } else if (track.ext === '.jpg' || track.ext === '.jpeg' || track.ext === '.png' || track.ext === '.webp' ) {
      fatherFolder.push({
        type: 'image',
        hash: track.hash,
        title: track.title,
        workTitle,
        mediaStreamUrl,
        mediaDownloadUrl
      });
    } else if (track.ext === '.pdf') {
      fatherFolder.push({
        type: 'other',
        hash: track.hash,
        title: track.title,
        workTitle,
        mediaStreamUrl,
        mediaDownloadUrl
      });
    } else {
      fatherFolder.push({
        type: 'audio',
        hash: track.hash,
        title: track.title,
        duration: track.duration,
        workTitle,
        mediaStreamUrl,
        mediaDownloadUrl
      });
    }
  });

  return tree;
};

/**
 * 返回一个成员为指定根文件夹下所有包含 RJ 号的音声文件夹对象的数组，
 * 音声文件夹对象 { relativePath: '相对路径', rootFolderName: '根文件夹别名', id: '音声ID' }
 * @param {Object} rootFolder 根文件夹对象 { name: '别名', path: '绝对路径' }
 */
const codeRegex = /((RJ|BJ)\d+)/;
async function* getFolderList(rootFolder, current = '', depth = 0, logger = console ) { // 异步生成器函数 async function*() {}
  // 浅层遍历
  const folders = await fs.promises.readdir(path.join(rootFolder.path, current));    

  for (const folder of folders) {
    const absolutePath = path.resolve(rootFolder.path, current, folder);
    const relativePath = path.join(current, folder);

    try {
    // eslint-disable-next-line no-await-in-loop
      if ((await fs.promises.stat(absolutePath)).isDirectory()) { // 检查是否为文件夹
          if (folder.match(codeRegex)) { // 检查文件夹名称中是否含有RJ号
            // Found a work folder, don't go any deeper.
            yield { absolutePath, relativePath, rootFolderName: rootFolder.name, code: folder.match(codeRegex)[1] };
          } else if (depth + 1 < config.scannerMaxRecursionDepth) {
            // 若文件夹名称中不含有RJ号，就进入该文件夹内部
            // Found a folder that's not a work folder, go inside if allowed.
            yield* getFolderList(rootFolder, relativePath, depth + 1);
          }
        }
    } catch (err) {
      if (err.code === 'EPERM') {
        if (err.path && !err.path.endsWith('System Volume Information')) {
          logger.error(` ! 无法访问 ${err.path}`);
        }
      } else {
        throw err;
      }
    }
  }
}

/**
 * Deletes a work's cover image from disk.
 * @param {String} rjcode Work RJ code (only the 6 digits, zero-padded).
 */
const deleteCoverImageFromDisk = rjcode => new Promise((resolve, reject) => {
  const types = ['main', 'sam', '240x240', '360x360'];
  types.forEach(type => {
    try {
      fs.unlinkSync(path.join(config.coverFolderDir, `${rjcode}_img_${type}.jpg`));
    } catch (err) {
      reject(err);
    }
  });

  resolve();
});

/**
 * Saves cover image to disk.
 * @param {ReadableStream} stream Image data stream.
 * @param {String} rjcode Work RJ code (only the 6 digits, zero-padded).
 * @param {String} types img type: ('main', 'sam', 'sam@2x', 'sam@3x', '240x240', '360x360').
 */
const saveCoverImageToDisk = (stream, rjcode, type) => new Promise((resolve, reject) => {
  // TODO: don't assume image is a jpg?
  try {
    stream.pipe(
      fs.createWriteStream(path.join(config.coverFolderDir, `${rjcode}_img_${type}.jpg`))
        .on('close', () => resolve()),
    );
  } catch (err) {
    reject(err);
  }
});


/**
 * 格式化 id，适配 8 位、6 位 id，转换成带有RJ前缀的番号
 * 为了兼容BJ等其他形式的作品番号，规定：
 * 1. 保留整数末尾的12位十进制用于番号的数字部分，比如RJ01234567中的1234567，称为id数字
 * 2. 高于12位十进制的部分，存储番号类型，用来指代RJ、BJ或者其他，称为id类型
 * 3. RJ的id类型为0，向前兼容
 * 4. BJ的id类型为1
 * @param {number} id
 * @return {string}
 */
const idSplitter = 1e12
function getIdType(id) {
  const t = typeof(id);
  switch (t) {
    case "string": return id.substring(0, 2);
    case "number": return Math.floor(id / idSplitter);
    default: throw Error(`get id type failed, ${id} is unsupported type ${t}`)
  }
}
function getIdDigit(id) {
  const t = typeof(id);
  switch (t) {
    case "string": return id.substring(2);
    case "number": return Math.floor(id % idSplitter);
    default: throw Error(`get id digit failed, ${id} is unsupported type ${t}`)
  }
}
function formatID(idDigit) {
  if (idDigit >= 1000000) {
    // 大于 7 位数，则补全为 8 位
    return `0${idDigit}`.slice(-8);
  } else {
    // 否则补全为 6 位
    return `000000${idDigit}`.slice(-6);
  }
}
function idNumberToCode(id) {
  const idDigit = getIdDigit(id);
  const idType = getIdType(id);
  const idPrefix = ["RJ", "BJ"][idType];
  return `${idPrefix}${formatID(idDigit)}`;
}
function codeToIdNumber(code) {
  if (code.startsWith("RJ")) {
    return parseInt(code.substr(2))
  } else if (code.startsWith("BJ")) {
    return 1 * idSplitter + parseInt(code.substr(2))
  } else {
    throw Error(`unkown code format: ${code}`)
  }
}

module.exports = {
  isContainLyric,
  getTrackList,
  toTree,
  getFolderList,
  deleteCoverImageFromDisk,
  saveCoverImageToDisk,
  formatID,
  getIdType,
  getIdDigit,
  idNumberToCode,
  codeToIdNumber,
  idSplitter,
  scrapeWorkMemo,
};