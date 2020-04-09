const fs = require('fs');
const path = require('path');
const LimitPromise = require('limit-promise'); // 限制并发数量

const axios = require('../scraper/axios'); // 数据请求
const { scrapeWorkMetadataFromDLsite, scrapeDynamicWorkMetadataFromDLsite } = require('../scraper/dlsite');
const db = require('../database/db');
const { createSchema } = require('../database/schema');
const { getFolderList, deleteCoverImageFromDisk, saveCoverImageToDisk } = require('./utils');

const config = require('../config.json');

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
 * 从 DLsite 抓取该音声的元数据，并保存到数据库，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} id work id
 * @param {string} rootFolderName 根文件夹别名
 * @param {string} dir 音声文件夹相对路径
 * @param {string} tagLanguage 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const getMetadata = (id, rootFolderName, dir, tagLanguage) => {
  const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
  console.log(` -> [RJ${rjcode}] 从 DLSite 抓取元数据...`);
  return scrapeWorkMetadataFromDLsite(id, tagLanguage) // 抓取该音声的元数据
    .then((metadata) => {
      // 将抓取到的元数据插入到数据库
      console.log(` -> [RJ${rjcode}] 元数据抓取成功，准备添加到数据库...`);
      metadata.rootFolderName = rootFolderName;
      metadata.dir = dir;
      return db.insertWorkMetadata(metadata)
        .then(() => {
          console.log(` -> [RJ${rjcode}] 元数据成功添加到数据库`);
          return 'added';
        })
        .catch((err) => {
          console.error(`  ! [RJ${rjcode}] 在插入元数据过程中出错: ${err.message}`);
          return 'failed';
        });
    })
    .catch((err) => {
      console.error(`  ! [RJ${rjcode}] 在抓取元数据过程中出错: ${err.message}`);
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
          console.log(` -> [RJ${rjcode}] 封面下载成功`);
          return 'added';
        });
    })
    .catch((err) => {
      console.error(`  ! [RJ${rjcode}] 在下载封面过程中出错: ${err.message}`);
      return 'failed';
    });
};

/**
 * 获取音声元数据，获取音声封面图片，
 * 返回一个 Promise 对象，处理结果: 'added', 'skipped' or 'failed'
 * @param {string} folder 音声文件夹对象 { relativePath: '相对路径', rootFolderName: '根文件夹别名', id: '音声ID' }
 */
const processFolder = (folder) => db.knex('t_work')
  .select('id')
  .where('id', '=', folder.id)
  .count()
  .first()
  .then((res) => {
    const rjcode = (`000000${folder.id}`).slice(-6); // zero-pad to 6 digits
    const processResult = {
      metadata: '', 
      coverImage: '' 
    };
    
    const count = res['count(*)'];
    if (count) { // 查询数据库，检查是否已经写入该音声的元数据
      // 已经成功写入元数据
      processResult.metadata = 'skipped';
   
      // 检查音声封面图片是否缺失
      const coverPath = path.join(config.coverFolderDir, `RJ${rjcode}.jpg`);
      if (!fs.existsSync(coverPath)) {
        console.log(`  ! [RJ${rjcode}] 封面图片缺失，重新下载封面图片...`);
        return getCoverImage(folder.id, config.coverSource)
          .then((result) => {
            processResult.coverImage = result;
            return processResult;
          });
      } else { // 封面图片已存在，跳过下载
        processResult.coverImage = 'skipped';
        return processResult;
      }
    } else {
      console.log(` * 在根文件夹 "${folder.rootFolderName}" 下发现新文件夹: "${folder.relativePath}"`);
      return getMetadata(folder.id, folder.rootFolderName, folder.relativePath, config.tagLanguage) // 获取元数据
        .then((result) => {
          processResult.metadata = result;
          if (result === 'failed') { // 如果获取元数据失败，跳过封面图片下载
            processResult.coverImage = 'skipped';
            return processResult;
          } else { // 下载封面图片
            return getCoverImage(folder.id, config.coverSource)
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
 */
const processFolderLimited = (folder) => {
  return limitP.call(processFolder, folder);
};

/**
 * 清理本地不再存在的音声: 将其元数据从数据库中移除，并删除其封面图片
 */
const performCleanup = () => {
  console.log(' * 清理本地不再存在的音声...');
  return db.knex('t_work')
    .select('id', 'root_folder', 'dir')
    .then((works) => {
      const promises = works.map(work => new Promise((resolve, reject) => { // 对work数组内的每一项，都新建一个Promise
        // 检查每个音声的根文件夹或本地路径是否仍然存在
        const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
        if (!rootFolder || !fs.existsSync(path.join(rootFolder.path, work.dir))) {
          db.removeWork(work.id) // 将其数据项从数据库中移除
            .then((result) => { // 然后删除其封面图片
              const rjcode = (`000000${work.id}`).slice(-6); // zero-pad to 6 digits
              deleteCoverImageFromDisk(rjcode)    
                .catch((err) => console.error(` -> [RJ${rjcode}] 在删除封面过程中出错: ${err.message}`))
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
  fs.mkdir(path.join(config.coverFolderDir), { recursive: true }, (direrr) => {
    if (direrr) {
      console.error(` ! 在尝试创建存放封面的文件夹时出错: ${direrr.code}`);
      return;
    }

    return createSchema() // 构建数据库结构
      .then(() => performCleanup()) // 清理本地不再存在的音声
      .catch((err) => {
        console.error(` ! ERROR while performing cleanup: ${err.message}`);
        return;
      })
      .then(async () => {
        console.log(' * Finished cleanup. Starting scan...');
        let folderList = [];

        try {
          folderList = await getAllFolderList();
          if (folderList.length === 0) { // 当库中没有名称包含 RJ 号的文件夹时
            console.log(' * Finished scan. Added 0, skipped 0 and failed to add 0 works.');
            return;
          }
        } catch (err) {
          console.error(` ! ERROR while trying to get folder list: ${err.message}`);
          return;
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

          const promises = uniqueFolderList.map((folder) => 
            processFolderLimited(folder)
              .then((processResult) => { // 统计处理结果
                const rjcode = (`000000${folder.id}`).slice(-6); // zero-pad to 6 digits

                if (processResult.metadata === 'failed' || processResult.coverImage === 'failed') {
                  counts['failed'] += 1;
                  console.log(`[RJ${rjcode}] Failed adding to the database! Failed: ${counts.failed}`);
                } else if (processResult.metadata === 'skipped' && processResult.coverImage === 'skipped') {
                  counts['skipped'] += 1;
                } else {
                  counts['added'] += 1;
                  console.log(`[RJ${rjcode}] Finished adding to the database! Added: ${counts.added}`);
                }
              })
          );

          return Promise.all(promises).then(() => {
            console.log(` * 扫描完成 Added ${counts.added}, skipped ${counts.skipped} and failed to add ${counts.failed} works.`);
            return counts;
          })
        } catch (err) {
          console.error(` ! 在扫描过程中出错: ${err.message}`);
          return;
        }
      })
      .catch((err) => {
        console.error(` ! 在创建数据库结构过程中出错: ${err.message}`);
        return;
      });
  });
};

/**
 * 更新音声的动态元数据
 * @param {number} id work id
 */
const updateMetadata = (id) => {
  const rjcode = (`000000${id}`).slice(-6); // zero-pad to 6 digits
  return scrapeDynamicWorkMetadataFromDLsite(id) // 抓取该音声的元数据
    .then((metadata) => {
      // 将抓取到的元数据插入到数据库
      console.log(` -> [RJ${rjcode}] 元数据抓取成功，准备更新元数据...`);
      metadata.id = id;
      return db.updateWorkMetadata(metadata)
        .then(() => {
          console.log(` -> [RJ${rjcode}] 元数据更新成功`);
          return 'updated';
        });
    })
    .catch((err) => {
      console.error(`  ! [RJ${rjcode}] 在抓取元数据过程中出错: ${err}`);
      return 'failed';
    });
};

const updateMetadataLimited = (id) => limitP.call(updateMetadata, id);

const performUpdate = () => db.knex('t_work').select('id')
  .then((works) => {
    let processedNum = 0;
    const counts = {
      updated: 0,
      failed: 0,
    };

    for (work of works) {
      updateMetadataLimited(work.id)
        .then((result) => { // 统计处理结果
          result === 'failed' ? counts['failed'] += 1 : counts['updated'] += 1;
          processedNum += 1;
          if (processedNum >= works.length) {
            console.log(` * 完成元数据更新 ${counts.updated} and failed to update ${counts.failed} works.`);
            process.exit(0);
          }
        });
    }
  });


const getAllFolderList = async () => {
  let folderList = [];
  for (const rootFolder of config.rootFolders) {
    // 遍历异步生成器函数 getFolderList()
    for await (const folder of getFolderList(rootFolder)) {
      folderList.push(folder);
    }
  }

  return folderList;
};


performScan();

// performUpdate();