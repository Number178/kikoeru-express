const fs = require('fs');
const path = require('path');
const recursiveReaddir = require('recursive-readdir');
const { orderBy } = require('natural-orderby');

const config = require('../config.json');

/**
 * Returns list of playable tracks in a given folder. Track is an object
 * containing 'title', 'subtitle' and 'hash'.
 * @param {Number} id Work identifier. Currently, RJ/RE code.
 * @param {String} dir Work directory (relative).
 */
const getTrackList = (id, dir) => recursiveReaddir(
  path.join(config.rootDir, dir),
)
  .then((files) => {
    // Filter out any files not matching these extensions
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file);

      return (ext === '.mp3' || ext === '.ogg' || ext === '.opus' || ext === '.wav' || ext === '.flac' || ext === '.webm' || ext === '.mp4'|| ext === '.m4a');
    });

    // Sort by folder and title
    const sortedFiles = orderBy(filteredFiles.map((file) => {
      const shortFilePath = file.replace(path.join(config.rootDir, dir, '/'), '');
      const dirName = path.dirname(shortFilePath);

      return {
        title: path.basename(file),
        subtitle: dirName === '.' ? null : dirName,
      };
    }), [v => v.subtitle, v => v.title]);

    // Add hash to each file
    const sortedHashedFiles = sortedFiles.map(
      (file, index) => ({
        title: file.title,
        subtitle: file.subtitle,
        hash: `${id}/${index}`,
      }),
    );

    return sortedHashedFiles;
  })
  .catch((err) => { throw new Error(`Failed to get tracklist from disk: ${err}`); });

/**
 * Returns list of directory names (relative) that contain an RJ code.
 */
async function* getFolderList(current = '', depth = 0) { // 异步生成器函数 async function*() {}
  // 浅层遍历rootDir路径
  const folders = await fs.promises.readdir(path.join(config.rootDir, current));    

  for (const folder of folders) {
    const absolutePath = path.resolve(config.rootDir, current, folder);
    const relativePath = path.join(current, folder);

    // eslint-disable-next-line no-await-in-loop
    if ((await fs.promises.stat(absolutePath)).isDirectory()) { // 检查是否为文件夹
      if (folder.match(/RJ\d{6}/)) { // 检查文件夹名称中是否含有RJ号
        // Found a work folder, don't go any deeper.
        yield relativePath;
      } else if (depth + 1 < config.scannerMaxRecursionDepth) {
        // 若文件夹名称中不含有RJ号，就进入该文件夹内部
        // Found a folder that's not a work folder, go inside if allowed.
        yield* getFolderList(relativePath, depth + 1);
      }
    }
  }
}

/**
 * Deletes a work's cover image from disk.
 * @param {String} rjcode Work RJ code (only the 6 digits, zero-padded).
 */
const deleteCoverImageFromDisk = rjcode => new Promise((resolve, reject) => {
  fs.unlink(path.join(config.rootDir, 'Images', `RJ${rjcode}.jpg`), (err) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  });
});

/**
 * Saves cover image to disk.
 * @param {ReadableStream} stream Image data stream.
 * @param {String} rjcode Work RJ code (only the 6 digits, zero-padded).
 */
const saveCoverImageToDisk = (stream, rjcode) => new Promise((resolve, reject) => {
  // TODO: don't assume image is a jpg?
  try {
    stream.pipe(
      fs.createWriteStream(path.join(config.rootDir, 'Images', `RJ${rjcode}.jpg`))
        .on('close', () => resolve()),
    );
  } catch (err) {
    reject(err);
  }
});

// 模块接口，声明这个模块对外暴露什么内容
module.exports = {
  getTrackList,
  getFolderList,
  deleteCoverImageFromDisk,
  saveCoverImageToDisk,
};

