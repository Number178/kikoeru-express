const fs = require('fs');
const path = require('path');
const LimitPromise = require('limit-promise'); // 限制并发数量

const axios = require('../scraper/axios.js'); // 数据请求
const { scrapeWorkMetadataFromDLsite, scrapeDynamicWorkMetadataFromDLsite, scrapeCoverIdForTranslatedWorkFromDLsite } = require('../scraper/dlsite');
const db = require('../database/db');
const { createSchema } = require('../database/schema');
const { isContainLyric, getFolderList, deleteCoverImageFromDisk, saveCoverImageToDisk, scrapeWorkMemo } = require('./utils');
const { md5 } = require('../auth/utils');
const { nameToUUID } = require('../scraper/utils');

const { config } = require('../config');
const { updateLock } = require('../upgrade');
const { formatID } = require('./utils');
const { assert } = require('console');

// 只有在子进程中 process 对象才有 send() 方法
process.send = process.send || function () {};

const tasks = [];
const failedTasks = [];
const mainLogs = [];
const results = [];

const LOG = {
  finish(message) {
    console.log(` * ${message}`);
    process.send({
      event: 'SCAN_FINISHED',
      payload: { message }
    }); 
  },
  main: {
    __internal__(level, message) {
      console[level]("main log", message);

      mainLogs.push({level, message });
      process.send({ event: 'SCAN_MAIN_LOGS', payload: { mainLogs } });
    },
    log(msg) { // default log at level info
      this.__internal__("info", msg)
    },
    debug(msg) {
      this.__internal__("debug", msg)
    },
    info(msg) {
      this.__internal__("info", msg)
    },
    error(msg) {
      this.__internal__("error", msg)
    },
    warn(msg) {
      this.__internal__("warn", msg)
    }
  },
  result: {
    add(rjcode, result, count) {
      results.push({
        rjcode,
        result,
        count
      });
      process.send({
        event: 'SCAN_RESULTS',
        payload: { results }
      });
    }
  },
  task: {
    // 添加作品专门的log记录
    add(taskId) { // taskId == rjcode, e.g. "443322" or "01134321"
      console.log(`LOG.task.add '${taskId}'`)
      console.assert(typeof(taskId) === "string" && (taskId.length === 6 || taskId.length === 8))
      tasks.push({
        rjcode: taskId,
        result: null,
        logs: []
      })
    },

    // 移除作品的专属log，如果该作品的对应任务失败，则发送相应的失败消息
    remove(taskId) {
      console.log(`LOG.task.remove '${taskId}'`)
      const index = tasks.findIndex(task => task.rjcode === taskId);
      const removedTask = tasks[index];
      tasks.splice(index, 1);
      process.send({ event: 'SCAN_TASKS', payload: { tasks } });

      if (removedTask.result === 'failed') {
        failedTasks.push(removedTask);
        process.send({ event: 'SCAN_FAILED_TASKS', payload: { failedTasks } });
      }
    },
    __internal_task__(taskId, level, msg) {
      console.assert(typeof(taskId) === "string" && (taskId.length === 6 || taskId.length === 8))
      console[level](`task[RJ${taskId}] log`, msg);

      tasks.find(task => task.rjcode === taskId).logs.push({ level, message: msg, });
      process.send({ event: 'SCAN_TASKS', payload: { tasks } });
    },
    log(taskId, msg) { // default log at level info
      this.__internal_task__(taskId, "info", msg)
    },
    debug(taskId, msg) {
      this.__internal_task__(taskId, "debug", msg)
    },
    info(taskId, msg) {
      this.__internal_task__(taskId, "info", msg)
    },
    error(taskId, msg) {
      this.__internal_task__(taskId, "error", msg)
    },
    warn(taskId, msg) {
      this.__internal_task__(taskId, "warn", msg)
    }

  },
};

process.on('message', (m) => {
  if (m.emit === 'SCAN_INIT_STATE') {
    process.send({
      event: 'SCAN_INIT_STATE',
      payload: {
        tasks,
        failedTasks,
        mainLogs,
        results
      }
    });
  } else if (m.exit) {
    LOG.main.error(' ! 终止扫描进程.')
    process.exit(1);
  }
});


/**
 * 通过数组 arr 中每个对象的 id 属性来对数组去重
 * @param {Array} arr 
 */
function uniqueFolderListSeparate(arr) {
  const uniqueList = [];
  const duplicateSet = {};

  for (let i=0; i<arr.length; i++) {
    for (let j=i+1; j<arr.length; j++) {
      if (arr[i].id === arr[j].id) {
        duplicateSet[arr[i].id] = duplicateSet[arr[i].id] || [];
        duplicateSet[arr[i].id].push(arr[i]);
        ++i;
      }
    }
    uniqueList.push(arr[i]);
  }

  return {
    uniqueList, // 去重后的数组
    duplicateSet, // 对象，键为id，值为多余的重复项数组
  };
};

/**
 * 从 DLsite 抓取该音声的元数据，并保存到数据库，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} id work id
 * @param {string} rootFolderName 根文件夹别名
 * @param {string} dir 音声文件夹相对路径
 * @param {string} tagLanguage 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 * @param {boolean} hasLyric 当前作品是否拥有本地字幕
 */
async function getMetadata(id, rootFolderName, dir, tagLanguage, hasLyric) {
  const rjcode = formatID(id); // zero-pad to 6 digits

  LOG.task.info(rjcode, '从 DLSite 抓取元数据...')
      
  try {
    const metadata = await scrapeWorkMetadataFromDLsite(id, tagLanguage) // 抓取该音声的元数据
    // 将抓取到的元数据插入到数据库
    LOG.task.info(rjcode, '元数据抓取成功，准备添加到数据库...')
    
    metadata.rootFolderName = rootFolderName;
    metadata.dir = dir;
    metadata.lyric_status = hasLyric ? "local" : "";

    await db.insertWorkMetadata(metadata);
    LOG.task.info(rjcode, '元数据成功添加到数据库.')

    return 'added';
  } catch(error) {
    LOG.task.error(rjcode, `元数据处理失败: ${error.message}`)
    return 'failed';
  }
};


/**
 * 从 DLsite 下载封面图片，处理翻译作品本身没有封面的情况，并保存到 Images 文件夹，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} id work id
 * @param {Array} types img types: ['main', 'sam', 'sam@2x', 'sam@3x', '240x240', '360x360']
 */
async function getCoverImageForTranslated(id, types) {
  const rjcode = formatID(id); // zero-pad to 6/8 digits
  let cover_from_id = rjcode; // 默认就使用原始的作品id
  try {
    // 抓取一次网页，检查当前作品封面到底使用的哪一个id
    // 因为有些翻译作品id自身没有封面文件，而是使用原版日文作品id对应的封面
    cover_from_id = await scrapeCoverIdForTranslatedWorkFromDLsite(rjcode);
    if (cover_from_id != rjcode) {
      LOG.task.info(rjcode, `当前作品RJ${rjcode}似乎不包含封面资源，例如一些翻译作品。从 DLsite 对应的原始作品RJ${cover_from_id}下载封面...`);
    }
  } catch (err) {
    LOG.task.error(rjcode, `在获取真实的封面id（适配那些翻译作品的封面问题） 过程中出错: ${err.message}`);
  }

  const result = await getCoverImage(id, parseInt(cover_from_id), types);
  return result;
}

/**
 * 从 DLsite 下载封面图片，并保存到 Images 文件夹，
 * 返回一个 Promise 对象，处理结果: 'added' or 'failed'
 * @param {number} cover_for_id download cover for this work id
 * @param {number} cover_from_id download cover from work id, since some translated work are using non-translated work's cover resource
 * @param {Array} types img types: ['main', 'sam', 'sam@2x', 'sam@3x', '240x240', '360x360']
 */
async function getCoverImage(cover_for_id, cover_from_id, types) {
  const cover_for_rjcode = formatID(cover_for_id);
  const rjcode = formatID(cover_from_id); // zero-pad to 6 or 8 digits
  const id2 = (cover_from_id % 1000 === 0) ? cover_from_id : Math.floor(cover_from_id / 1000) * 1000 + 1000;
  const rjcode2 = formatID(id2); // zero-pad to 6 or 8 digits

  LOG.task.info(cover_for_rjcode, `从 DLsite 下载封面...`)
  const results = await Promise.all(types.map(async (type) => {
    let url = `https://img.dlsite.jp/modpub/images2/work/doujin/RJ${rjcode2}/RJ${rjcode}_img_${type}.jpg`;
    if (type === '240x240'|| type === '360x360') {
      url = `https://img.dlsite.jp/resize/images2/work/doujin/RJ${rjcode2}/RJ${rjcode}_img_main_${type}.jpg`;
    }

    try {
      const imageRes = await axios.retryGet(url, { responseType: "stream", retry: {} });
      await saveCoverImageToDisk(imageRes.data, cover_for_rjcode, type);
      LOG.task.info(cover_for_rjcode, `封面 RJ${rjcode}_img_${type}.jpg 下载成功.`);
      return 'added';
    } catch(err) {
      LOG.task.error(cover_for_rjcode, `在下载封面 RJ${rjcode}_img_${type}.jpg 过程中出错: ${err.message}`);
      return 'failed';
    }
  }))

  return results.includes("failed") 
      ? "failed" 
      : "added";
};

/**
 * 获取音声元数据，获取音声封面图片，
 * 返回一个 Promise 对象，处理结果: 'added', 'skipped' or 'failed'
 * @param {string} folder 音声文件夹对象 { relativePath: '相对路径', rootFolderName: '根文件夹别名', id: '音声ID' }
 */
async function processFolder(folder) {
  const res = await db.knex('t_work')
    .select('id')
    .where('id', '=', folder.id)
    .count()
    .first();

  const rjcode = formatID(folder.id); // zero-pad to 6 digits
  const coverTypes = ['main', 'sam', '240x240'];
  const count = res['count(*)'];

  if (count) { // 查询数据库，检查是否已经写入该音声的元数据
    // 已经成功写入元数据
    // 检查音声封面图片是否缺失
    const lostCoverTypes = [];
    coverTypes.forEach(type => {
      const coverPath = path.join(config.coverFolderDir, `RJ${rjcode}_img_${type}.jpg`);
      if (!fs.existsSync(coverPath)) {
        lostCoverTypes.push(type);
      }
    });
    
    if (lostCoverTypes.length) {
      LOG.task.add(rjcode);
      LOG.task.info(rjcode, '封面图片缺失，重新下载封面图片...')
      return getCoverImageForTranslated(folder.id, lostCoverTypes);
    } else {
      return 'skipped';
    }
  } else {
    LOG.task.add(rjcode);
    LOG.task.info(rjcode, `发现新文件夹: "${folder.absolutePath}"`)

    // 检查本地字幕
    const hasLyric = await isContainLyric(folder.id, folder.absolutePath);
    LOG.task.info(rjcode, `作品中是否有字幕：${hasLyric}`);

    LOG.task.info(rjcode, `扫描音频文件时长`);
    const memo = await scrapeWorkMemo(folder.id, folder.absolutePath);
    
    const result = await getMetadata(folder.id, folder.rootFolderName, folder.relativePath, config.tagLanguage, hasLyric); // 获取元数据
    await db.setWorkMemo(folder.id, memo);

    // 如果获取元数据失败，跳过封面图片下载
    if (result === 'failed') {
      return 'failed';
    }
    
    return await getCoverImageForTranslated(folder.id, coverTypes);
  }
}

const MAX = config.maxParallelism; // 并发请求上限
const limitP = new LimitPromise(MAX); // 核心控制器
/**
 * 限制 processFolder 并发数量，
 * 使用控制器包装 processFolder 方法，实际上是将请求函数递交给控制器处理
 */
async function processFolderLimited(folder){
  return await limitP.call(processFolder, folder);
};

/**
 * 清理本地不再存在的音声: 将其元数据从数据库中移除，并删除其封面图片
 */
async function performCleanup() {
  const trxProvider = db.knex.transactionProvider();
  const trx = await trxProvider();
  const works = await trx('t_work').select('id', 'root_folder', 'dir');

  await Promise.all(works.map(async (work) => {
    // 检查每个音声的根文件夹或本地路径是否仍然存在
    const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
    if (rootFolder && fs.existsSync(path.join(rootFolder.path, work.dir))) {
      // 仍然存在，则不做清理
      return;
    }

    await db.removeWork(work.id, trxProvider); // 将其数据项从数据库中移除
    const rjcode = formatID(work.id); // zero-pad to 6 digits
    try {
      // 然后删除其封面图片
      await deleteCoverImageFromDisk(rjcode)    
    } catch(err) {
      if (err && err.code !== 'ENOENT') { 
          LOG.main.error(`[RJ${rjcode}] 在删除封面过程中出错: ${err.message}`);
      }
    }
  }));

  trx.commit();
};

// 尝试创建数据库
async function tryCreateDatabase() {
  try {
    await createSchema();
  } catch(err) {
    LOG.main.error(`在构建数据库结构过程中出错: ${err.message}`);
    console.error(err.stack)
    process.exit(1);
  }
}

// 尝试创建管理员账号，如果已存在则忽略
// 如果发生其他异常则直接杀死本进程
async function tryCreateAdminUser() {
  try { // 创建内置的管理员账号
    await db.createUser({
      name: 'admin',
      password: md5('admin'),
      group: 'administrator'
    });
  } catch(err) {
    if (err.message.indexOf('已存在') === -1) {
      LOG.main.error(`在创建 admin 账号时出错: ${err.message}`);
      process.exit(1);
    }
  }
}

// 修复以往的数据库问题，老逻辑了，不太清楚具体修复的问题是什么，先放在这里
// 成功返回true，失败返回false
async function fixVADatabase() {
  // Fix hash collision bug in t_va
  // Scan to repopulate the Voice Actor data for those problematic works
  // かの仔 and こっこ
  let success = true;
  if (updateLock.isLockFilePresent && updateLock.lockFileConfig.fixVA) {
    LOG.main.log('开始进行声优元数据修复，需要联网');
    try {
      const updateResult = await fixVoiceActorBug();
      counts.updated += updateResult;
      updateLock.removeLockFile();
      LOG.main.log('完成元数据修复');
    } catch (err) {
      LOG.main.error(err.toString());
      success = false;
    }
  }
  return success;
}

// 尝试清理不存在的数据，该阶段可能会根据用户配置跳过
// 如果清理过程中发生一场则杀死该进程
async function tryCleanupStage() {
  if (config.skipCleanup) {
    LOG.main.info('跳过清理“不存在的音声数据”');
  } else {
    try {
      LOG.main.info('清理本地不再存在的音声的数据与封面图片...');
      await performCleanup();
      LOG.main.info('清理完成. 现在开始扫描...');
    } catch(err) {
      LOG.main.error(`在执行清理过程中出错: ${err.message}`);
      process.exit(1);
    }
  }
}

// 尝试扫描所有媒体库的文件夹
// 返回扫描得到的work的文件夹
async function tryScanRootFolders() {
  let folderList = [];
  try {
    for (const rootFolder of config.rootFolders) {
      for await (const folder of getFolderList(rootFolder, '', 0, LOG.main)) {
        folderList.push(folder);
      }
    }
    LOG.main.info(`共找到 ${folderList.length} 个音声文件夹.`);
  } catch (err) {
    LOG.main.error(`在扫描根文件夹的过程中出错: ${err.message}`);
    process.exit(1);
  }

  return folderList;
}

// 并行处理这些文件夹
// 返回总的处理结果，表明处理的数量
// {
//   added: 0, // 添加的文件夹数量
//   failed: 0, // 失败
//   skipped: 0, // 跳过
//   updated: 0, // 更新
// };
async function tryProcessFolderListParallel(folderList) {
  const counts = {
    added: 0,
    failed: 0,
    skipped: 0,
    updated: 0
  };

  try {
    // 去重，避免在之后的并行处理文件夹过程中，出现对数据库同时写入同一条记录的错误
    const { uniqueList: uniqueFolderList, duplicateSet} = uniqueFolderListSeparate(folderList);
    const duplicateNum = folderList.length - uniqueFolderList.length;

    if (duplicateNum) {
      LOG.main.info(`发现 ${duplicateNum} 个重复的音声文件夹.`);
      
      for (const key in duplicateSet) {
        // duplicateSet中并不包含存在于uniqueFolderList中的文件夹，
        // 将unique和duplicate重复的选项添加回duplicateSet，方便用户观察那些文件夹是重复的
        const addedFolder = uniqueFolderList.find(folder => folder.id === parseInt(key));
        duplicateSet[key].push(addedFolder); // 最后一项为是被添加到数据库中的音声文件夹，将其一同展示给用户

        const rjcode = formatID(key); // zero-pad to 6 or 8 digits

        LOG.main.info(`[RJ${rjcode}] 存在多个文件夹:`)

        // 打印音声文件夹的绝对路径
        duplicateSet[key].forEach((folder) => {
          const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === folder.rootFolderName);
          const absolutePath = path.join(rootFolder.path, folder.relativePath);
          LOG.main.info(`--> ${absolutePath}`)
        });
      }
    }

    counts.skipped += duplicateNum;

    await Promise.all(uniqueFolderList.map(async (folder) => {
      const result = await processFolderLimited(folder);
      counts[result] += 1;

      const rjcode = formatID(folder.id); // zero-pad to 6 digits\
      if (result === 'added' || result === 'failed') {
        switch(result) {
          case 'added': LOG.task.info(rjcode, `添加成功! Added: ${counts.added}`); break;
          case 'failed': LOG.task.error(rjcode, `添加失败! Failed: ${counts.failed}`); break;
          default: break;
        }
        tasks.find(task => task.rjcode === rjcode).result = result;
        LOG.task.remove(rjcode);
        LOG.result.add(rjcode, result, counts[result]);
      }
    }));

  } catch (err) {
    LOG.main.error(`在并行处理音声文件夹过程中出错: ${err.message}`);
    console.error(err.stack)
    process.exit(1);
  }

  return counts;
}

/**
 * 执行扫描
 * createCoverFolder => createSchema => cleanup => getAllFolderList => processAllFolder
 */
async function performScan() {
  if (!fs.existsSync(config.coverFolderDir)) {
    try {
      fs.mkdirSync(config.coverFolderDir, { recursive: true });
    } catch(err) {
      LOG.main.error(`在创建存放音声封面图片的文件夹时出错: ${err.message}`);
      process.exit(1);
    }
  }

  await tryCreateDatabase();
  await tryCreateAdminUser();

  const fixVADatabaseSuccess = await fixVADatabase();
  await tryCleanupStage();

  const folderList = await tryScanRootFolders();
  const folderResult = await tryProcessFolderListParallel(folderList);

  const message = folderResult.updated ?  `扫描完成: 更新 ${folderResult.updated} 个，新增 ${folderResult.added} 个，跳过 ${folderResult.skipped} 个，失败 ${folderResult.failed} 个.` : `扫描完成: 新增 ${folderResult.added} 个，跳过 ${folderResult.skipped} 个，失败 ${folderResult.failed} 个.`;
  LOG.finish(message);

  db.knex.destroy();
  if (!fixVADatabaseSuccess) {
    process.exit(1);
  }
  process.exit(0);
};

/**
 * 更新音声的动态元数据
 * @param {number} id work id
 * @param {options = {}} options includeVA, includeTags
 */
async function updateMetadata(id, options = {}) {
  let scrapeProcessor = () => scrapeDynamicWorkMetadataFromDLsite(id);
  if (options.includeVA || options.includeTags || options.includeNSFW || options.refreshAll) {
    // static + dynamic
    scrapeProcessor = () => scrapeWorkMetadataFromDLsite(id, config.tagLanguage);
  }

  const rjcode = formatID(id); // zero-pad to 6 or 8 digits
  LOG.task.add(rjcode); // LOG.task.add only accepts a string

  try {
    const metadata = await scrapeProcessor() // 抓取该音声的元数据
    // 将抓取到的元数据插入到数据库
    LOG.task.log(rjcode, `元数据抓取成功，准备更新元数据...`)
    metadata.id = id;

    await db.updateWorkMetadata(metadata, options)
    LOG.task.log(rjcode, `元数据更新成功`)
    return 'updated';
  } catch(err) {
    LOG.task.error(rjcode, `在抓取元数据过程中出错: ${err}`)
    console.error(err.stack)
    return 'failed';
  }
};

const updateMetadataLimited = (id, options = null) => limitP.call(updateMetadata, id, options);
const updateVoiceActorLimited = (id) => limitP.call(updateMetadata, id, { includeVA: true });

// eslint-disable-next-line no-unused-vars
async function performUpdate(options = null) {
  const baseQuery = db.knex('t_work').select('id');
  const processor = (id) => updateMetadataLimited(id, options);

  const counts = await refreshWorks(baseQuery, 'id', processor);

  const message = `扫描完成: 更新 ${counts.updated} 个，失败 ${counts.failed} 个.`;
  LOG.finish(message);
  db.knex.destroy();
  if (counts.failed) process.exit(1);
};

async function fixVoiceActorBug() {
  const baseQuery = db.knex('r_va_work').select('va_id', 'work_id');
  const filter = (query) => query.where('va_id', nameToUUID('かの仔')).orWhere('va_id', nameToUUID('こっこ'));
  const processor = (id) => updateVoiceActorLimited(id);
  return await refreshWorks(filter(baseQuery), 'work_id', processor);
};

async function refreshWorks(query, idColumnName, processor) {
  const works = await query;
  LOG.main.info(`共 ${works.length} 个作品. 开始刷新`);

  const counts = {
    updated: 0,
    failed: 0,
  }; 

  await Promise.all(works.map(async (work) => {
    const workid = work[idColumnName];
    const rjcode = formatID(workid);
    
    const result = (await processor(workid)) === 'failed'
    ? 'failed'
    : 'updated';

    counts[result]++;
    tasks.find(task => task.rjcode === rjcode).result = result;
    LOG.task.remove(rjcode);
    LOG.result.add(rjcode, result, counts[result]);
  }));

  LOG.main.log(`完成元数据更新 ${counts.updated} 个，失败 ${counts.failed} 个.`);
  return counts;
};

// 扫描一个作品的文件夹中的文件信息
// 例如音频时长、是否包含歌词文件等
async function scanWorkFile(work) {
  const rjcode = formatID(work.id);

  try {
    const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
    if (!rootFolder) return "skipped";

    // lyric status
    const absoluteWorkDir = path.join(rootFolder.path, work.dir);
    const hasLocalLyric = await isContainLyric(work.id, absoluteWorkDir);
    let toStatus = work.lyric_status;
    if (hasLocalLyric && !work.lyric_status.includes("local")) {
      toStatus = work.lyric_status.includes("ai") ? "ai_local" : "local";
    } else if (!hasLocalLyric && work.lyric_status.includes("local")) {
      toStatus = work.lyric_status.includes("ai") ? "ai" : "";
    }
    if (toStatus !== work.lyric_status) {
      LOG.main.info(`[RJ${rjcode}] 歌词状态发生改变 '${work.lyric_status}' to '${toStatus}'`)
      await db.updateWorkLyricStatus(work, toStatus);
      return "updated";
    }

    // work memo, for instance, memorize all audio durations
    const memo = await scrapeWorkMemo(work.id, absoluteWorkDir);
    console.log('work: ', absoluteWorkDir);
    console.log('memo: ', memo);
    await db.setWorkMemo(work.id, memo);

  } catch(error) {
    LOG.main.error(`[RJ${rjcode}] 扫描歌词过程中发生错误：${error}`);
    console.error(error.stack);
    return "failed";
  }
}
const scanWorkFileLimited = (work) => limitP.call(scanWorkFile, work)
async function performWorkFileScan() {
  LOG.main.info(`扫描歌词开始`);
  const works = await db.knex('t_work').select('id', "root_folder", "dir", "lyric_status");

  const results = await Promise.all(works.map(scanWorkFileLimited));

  const counts = results.reduce((acc, x) => ( acc[x]++, acc ), {
    updated: 0,
    skipped: 0,
    failed: 0,
  });

  const message = `扫描完成: 更新 ${counts.updated} 个，失败 ${counts.failed} 个，跳过 ${counts.skipped} 个.`;
  LOG.finish(message);
  db.knex.destroy();
  if (counts.failed) process.exit(1);
  process.exit(0);
}

module.exports = { performScan, performUpdate, performWorkFileScan };