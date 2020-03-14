const fs = require('fs');
const path = require('path');
const LimitPromise = require('limit-promise'); // 限制并发数量

const axios = require('../scraper/axios'); // 数据请求
const db = require('../database/db');
const { getFolderList, deleteCoverImageFromDisk, saveCoverImageToDisk } = require('./utils');
const { createSchema } = require('../database/schema');
const scrapeWorkMetadataFromHVDB = require('../scraper/hvdb');
const scrapeWorkMetadataFromDLsite = require('../scraper/dlsite');

const config = require('../config.json');

/**
 * 检查文件是否存在，
 * 返回一个 Promise 对象
 * @param {string} filePath 文件路径
 */
const isFileExisted = (filePath) => {
  return new Promise(function(resolve, reject) {
    fs.exists(filePath, (exists) => {
      if (exists) {
        resolve(true);
      } else {
        resolve(false);
      }
    })
  });
};

/**
 * 通过数组 arr 中每个对象的 id 属性来对数组去重
 * 返回一个对象, 包含去重后的数组 uniquedArr，以及成员为重复 id 的数组 duplicateIDArr
 * @param {Array} arr 
 */
const uniqueArr = (arr) => {
  const uniquedArr = [];
  let duplicateIDArr = [];

  for (var i=0; i<arr.length; i++) {
    for (var j=i+1; j<arr.length; j++) {
      if (arr[i].id === arr[j].id) {
        duplicateIDArr.push(arr[i].id);
        ++i;
      }
    }
    uniquedArr.push(arr[i]);
  }

  // 数据结构 Set, 它类似于数组, 但是成员的值都是唯一的, 没有重复的值
  const set = new Set(); 
  duplicateIDArr.forEach(x => set.add(x));
  duplicateIDArr = Array.from(set); // set 转数组

  return {
    uniquedArr,
    duplicateIDArr
  };
};

/**
 * Scrapes work metadata.
 * @param {number} id Work id.
 * @param {String} tagLanguage 标签语言
 */
const scrapeWorkMetadata = (id, tagLanguage) => {
  if (tagLanguage === 'en-us') {
    return scrapeWorkMetadataFromHVDB(id);
  } else {
    return scrapeWorkMetadataFromDLsite(id, tagLanguage);
  }
};

/**
 * 从 DLsite 或 HVDB 抓取该作品的元数据，并保存到数据库，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} id work id
 * @param {string} folder 文件夹相对路径
 * @param {string} tagLanguage 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const getMetadata = (id, folder, tagLanguage) => {
  const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
  return scrapeWorkMetadata(id, tagLanguage) // 抓取该作品的元数据
      .then((metadata) => {
        // 将抓取到的元数据插入到数据库
        console.log(` -> [RJ${rjcode}] Fetched metadata! Adding to database...`);
        metadata.dir = folder;
        return db.insertWorkMetadata(metadata)
          .then(() => {
            console.log(` -> [RJ${rjcode}] Finished adding to the database!`);
            return 'added';
          });
      })
      .catch((err) => {
        console.error(`  ! [RJ${rjcode}] Failed to fetch metadata: ${err.message}`);
        return 'failed';
      });
};

/**
 * 从 HVDB 或 DLsite 下载封面图片，并保存到 Images 文件夹，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} id work id
 * @param {string} coverSource 封面图片源，'HVDB' or 'DLsite'，默认'DLsite'
 */
const getCoverImage = (id, coverSource) => {
  const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
  let url = '';
  switch (coverSource) {
    case 'HVDB':
      url = `https://hvdb.me/WorkImages/RJ${rjcode}.jpg`;
      break;
    default:
      // 默认从 DLsite 下载封面图片
      const id2 = (id % 1000 === 0) ? id : parseInt(id / 1000) * 1000 + 1000;
      const rjcode2 = (`000000${id2}`).slice(-6); // zero-pad to 6 digits
      url = `https://img.dlsite.jp/modpub/images2/work/doujin/RJ${rjcode2}/RJ${rjcode}_img_main.jpg`;
  }

  return axios.get(url, { responseType: "stream" })
    .then((imageRes) => {
      return saveCoverImageToDisk(imageRes.data, rjcode)
        .then(() => {
          console.log(` -> [RJ${rjcode}] Cover image downloaded!`);
          return 'added';
        });
    })
    .catch((err) => {
      console.error(`  ! [RJ${rjcode}] Failed to download cover image: ${err.message}`);
      return 'failed';
    });
};

/**
 * 获取作品元数据，获取作品封面图片，
 * 返回一个 Promise 对象，处理结果: 'added', 'skipped' or 'failed'
 * @param {number} id work id
 * @param {string} folder 文件夹相对路径
 * @param {string} tagLanguage 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 * @param {string} coverSource 封面图片源，'HVDB' or 'DLsite'，默认'DLsite'
 */
const processFolder = (id, folder, tagLanguage, coverSource) => db.knex('t_work')
  .where('id', '=', id) // select * from 't_work' where 'id' = id
  .count()
  .first()
  .then((res) => {
    const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
    const processResult = {
      metadata: '', 
      coverImage: '' 
    };
    
    const count = res['count(*)'];
    if (count) { // 查询数据库，检查是否已经写入该作品的元数据
      // 已经成功写入元数据
      processResult.metadata = 'skipped';
   
      // 检查作品封面图片是否缺失
      coverPath = path.join(config.rootDir, 'Images', `RJ${rjcode}.jpg`);
      return isFileExisted(coverPath)
        .then((exists) => {
          if (!exists) { // 封面图片缺失，重新下载封面图片
            console.log(`  ! [RJ${rjcode}] Cover image missing.`);
            return getCoverImage(id, coverSource)
              .then((result) => {
                processResult.coverImage = result;
                return processResult;
              });
          } else { // 封面图片已存在，跳过下载
            processResult.coverImage = 'skipped';
            return processResult;
          }
        });
    } else { // 发现新文件夹
      console.log(` * Found new folder: ${folder}`);
      console.log(` -> [RJ${rjcode}] Fetching metadata...`);
      return getMetadata(id, folder, tagLanguage) // 获取元数据
        .then((result) => {
          processResult.metadata = result;
          if (result === 'failed') { // 如果获取元数据失败，跳过封面图片下载
            processResult.coverImage = 'skipped';
            return processResult;
          } else { // 下载封面图片
            return getCoverImage(id, coverSource)
              .then((result) => {
                processResult.coverImage = result;
                return processResult;
              });
          }
        });
    }
  });

const MAX = config.maxParallelism; // 并发请求上限
const limitP = new LimitPromise(MAX); // 核心控制器
/**
 * 限制 processFolder 并发数量，
 * 使用控制器包装 processFolder 方法，实际上是将请求函数递交给控制器处理
 * @param {number} id Work id.
 * @param {string} folder 文件夹相对路径
 */
const processFolderLimited = (id, folder) => {
  return limitP.call(processFolder, id, folder, config.tagLanguage, config.coverSource);
};

/**
 * performCleanup()
 * 清理本地不再存在的音声: 将其元数据从数据库中移除，并删除其封面图片
 */
const performCleanup = () => {
  //console.log(' * Looking for folders to clean up...');
  return db.knex('t_work')
    .select('id', 'dir')
    .then((works) => {
      const promises = works.map(work => new Promise((resolve, reject) => { // 对work数组内的每一项，都新建一个Promise
        // 检查每个音声的本地路径是否仍然存在，若不再存在，将其数据项从数据库中移除，然后删除其封面图片。
        if (!fs.existsSync(path.join(config.rootDir, work.dir))) {
          //console.warn(` ! ${work.dir} is missing from filesystem. Removing from database...`);
          db.removeWork(work.id) // 将其数据项从数据库中移除
            .then((result) => { // 然后删除其封面图片
              const rjcode = (`000000${work.id}`).slice(-6); // zero-pad to 6 digits
              deleteCoverImageFromDisk(rjcode)    
                .catch(() => console.log(` -> [RJ${rjcode}] Failed to delete cover image.`))
                .then(() => resolve(result));
            })
            .catch(err => reject(err));
        } else {
          resolve();
        }
      }));

      return Promise.all(promises);
    });
};

/**
 * 执行扫描
 */
const performScan = () => {
  // 在 rootDir 路径下创建 Images 文件夹
  fs.mkdir(path.join(config.rootDir, 'Images'), (direrr) => {
    if (direrr && direrr.code !== 'EEXIST') {
      console.error(` ! ERROR while trying to create Images folder: ${direrr.code}`);
      process.exit(1);
    }

    return createSchema() // 构建数据库结构
      .then(() => performCleanup()) // 清理本地不再存在的音声
      .catch((err) => {
        console.error(` ! ERROR while performing cleanup: ${err.message}`);
        process.exit(1);
      })
      .then(async () => {
        console.log(' * Finished cleanup. Starting scan...');
        let folderList = [];

        try {
          // 遍历异步生成器函数 getFolderList()
          for await (const folder of getFolderList()) {
            folderList.push({
              id: folder.match(/RJ(\d{6})/)[1],
              folderDir: folder
            });
          }

          if (folderList.length === 0) { // 当库中没有名称包含 RJ 号的文件夹时
            console.log(' * Finished scan. Added 0, skipped 0 and failed to add 0 works.');
            process.exit(1);
          }
        } catch (err) {
          console.error(` ! ERROR while trying to get folder list: ${err.message}`);
          process.exit(1);
        }

        try {
          var processedNum = 0;
          const counts = {
            added: 0,
            failed: 0,
            skipped: 0,
          };

          // 去重，避免在之后的并行处理文件夹过程中，出现对数据库同时写入同一条记录的错误
          const uniqueFolderList = uniqueArr(folderList).uniquedArr;
          const duplicateRJcode = uniqueArr(folderList).duplicateIDArr.map((id) => {
            const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
            return 'RJ' + rjcode;
          });
          const duplicateNum = folderList.length - uniqueFolderList.length;

          counts['skipped'] += duplicateNum;
          if (duplicateNum > 0) {
            console.log(` * Found ${duplicateNum} duplicate folders : ${duplicateRJcode.join(", ")}`);
          }
          
          // 并行处理文件夹
          for(let folder of uniqueFolderList){
            processFolderLimited(folder.id, folder.folderDir)
              .then((processResult) => { // 统计处理结果
                const rjcode = (`000000${folder.id}`).slice(-6); // zero-pad to 6 digits

                if(processResult.metadata === 'failed' || processResult.coverImage === 'failed') {
                  counts['failed'] += 1;
                  console.log(`[RJ${rjcode}] Failed adding to the database! Failed: ${counts.failed}`);

                } else if (processResult.metadata === 'skipped' && processResult.coverImage === 'skipped') {
                  counts['skipped'] += 1;

                } else {
                  counts['added'] += 1;
                  console.log(`[RJ${rjcode}] Finished adding to the database! Added: ${counts.added}`);
                }
                
                processedNum += 1;
                if (processedNum >= uniqueFolderList.length) {
                  console.log(` * Finished scan. Added ${counts.added}, skipped ${counts.skipped} and failed to add ${counts.failed} works.`);
                  process.exit(0);
                }
              });
          }
        } catch (err) {
          console.error(` ! ERROR while performing scan: ${err.message}`);
          process.exit(1);
        }
      })
      .catch((err) => {
        console.error(` ! ERROR while creating database schema: ${err.message}`);
        process.exit(1);
      });
  });
};

performScan();
