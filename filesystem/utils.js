const fs = require('fs');
const path = require('path');
const recursiveReaddir = require('recursive-readdir');
const { orderBy } = require('natural-orderby');

const { getConfig } = require('../config');
const config = getConfig();

/**
 * Returns list of playable tracks in a given folder. Track is an object
 * containing 'title', 'subtitle' and 'hash'.
 * @param {Number} id Work identifier. Currently, RJ/RE code.
 * @param {String} dir Work directory (absolute).
 */
const getTrackList = (id, dir) => recursiveReaddir(dir)
  .then((files) => {
    // Filter out any files not matching these extensions
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file);

      return (ext === '.mp3' || ext === '.ogg' || ext === '.opus' || ext === '.wav' 
        || ext === '.flac' || ext === '.webm' || ext === '.mp4'|| ext === '.m4a' 
        || ext === '.txt' 
        || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp');
    });

    // Sort by folder and title
    const sortedFiles = orderBy(filteredFiles.map((file) => {
      const shortFilePath = file.replace(path.join(dir, '/'), '');
      const dirName = path.dirname(shortFilePath);

      return {
        title: path.basename(file),
        subtitle: dirName === '.' ? null : dirName,
        ext: path.extname(file),
      };
    }), [v => v.subtitle, v => v.title, v => v.ext]);

    // Add hash to each file
    const sortedHashedFiles = sortedFiles.map(
      (file, index) => ({
        title: file.title,
        subtitle: file.subtitle,
        hash: `${id}/${index}`,
        ext: file.ext,
      }),
    );

    return sortedHashedFiles;
  })
  .catch((err) => { throw new Error(`Failed to get tracklist from disk: ${err}`); });

/**
 * 转换成树状结构
 * @param {Array} tracks 
 * @param {String} workTitle 
 */
const toTree = (tracks, workTitle) => {
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
    const path = track.subtitle ? track.subtitle.split('\\') : [];
    path.forEach(folderName => {
      fatherFolder = fatherFolder.find(item => item.type === 'folder' && item.title === folderName).children;
    });

    if (track.ext === '.txt') {
      fatherFolder.push({
        type: 'text',
        hash: track.hash,
        title: track.title,
        workTitle
      });
    } else if (track.ext === '.jpg' || track.ext === '.jpeg' || track.ext === '.png' || track.ext === '.webp' ) {
      fatherFolder.push({
        type: 'image',
        hash: track.hash,
        title: track.title,
        workTitle
      });
    } else {
      fatherFolder.push({
        type: 'file',
        hash: track.hash,
        title: track.title,
        workTitle
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
async function* getFolderList(rootFolder, current = '', depth = 0) { // 异步生成器函数 async function*() {}
  // 浅层遍历
  const folders = await fs.promises.readdir(path.join(rootFolder.path, current));    

  for (const folder of folders) {
    const absolutePath = path.resolve(rootFolder.path, current, folder);
    const relativePath = path.join(current, folder);

    // eslint-disable-next-line no-await-in-loop
    if ((await fs.promises.stat(absolutePath)).isDirectory()) { // 检查是否为文件夹
      if (folder.match(/RJ\d{6}/)) { // 检查文件夹名称中是否含有RJ号
        // Found a work folder, don't go any deeper.
        yield { absolutePath, relativePath, rootFolderName: rootFolder.name, id: parseInt(folder.match(/RJ(\d{6})/)[1]) };
      } else if (depth + 1 < config.scannerMaxRecursionDepth) {
        // 若文件夹名称中不含有RJ号，就进入该文件夹内部
        // Found a folder that's not a work folder, go inside if allowed.
        yield* getFolderList(rootFolder, relativePath, depth + 1);
      }
    }
  }
}

/**
 * Deletes a work's cover image from disk.
 * @param {String} rjcode Work RJ code (only the 6 digits, zero-padded).
 */
const deleteCoverImageFromDisk = rjcode => new Promise((resolve, reject) => {
  const types = ['main', 'sam'];
  types.forEach(type => {
    try {
      fs.unlinkSync(path.join(config.coverFolderDir, `RJ${rjcode}_img_${type}.jpg`));
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
 * @param {String} types img type: ('main', 'sam', 'sam@2x' or 'sam@3x').
 */
const saveCoverImageToDisk = (stream, rjcode, type) => new Promise((resolve, reject) => {
  // TODO: don't assume image is a jpg?
  try {
    stream.pipe(
      fs.createWriteStream(path.join(config.coverFolderDir, `RJ${rjcode}_img_${type}.jpg`))
        .on('close', () => resolve()),
    );
  } catch (err) {
    reject(err);
  }
});


module.exports = {
  getTrackList,
  toTree,
  getFolderList,
  deleteCoverImageFromDisk,
  saveCoverImageToDisk,
};

