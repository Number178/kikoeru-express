const path = require('path');
const fs = require('fs');
const crypto = require('crypto')
const express = require('express');
const router = express.Router();
const { query, param, body } = require('express-validator');
const db = require('../database/db');
const { config } = require('../config');
const { getTrackList } = require('../filesystem/utils');
const { isValidRequest } = require('./utils/validate');
const { formatID } = require('../filesystem/utils');
const { AILyricTaskStatus } = require('../common.js');

const PAGE_SIZE = config.pageSize || 12;

function generateDummyTaskPage(page) {
  // generate dummy tasks
  const totalCount = 110;
  const totalPage = Math.ceil(totalCount / PAGE_SIZE);
  let taskCount = page === totalPage ? 2 : PAGE_SIZE;
  return {
    pagination: {
      currentPage: page,
      pageSize: PAGE_SIZE,
      totalCount,
    },
    tasks: Array(taskCount).fill(0).map((_, i) => {
      return {
        id: 1220000 + page * PAGE_SIZE * 1000 + i,
        work_id: 1000 + i % 7,
        audio_path: `some/path/${page}_${i}_${Math.round(Math.random() * 100)}.mp3`,
        status: i % AILyricTaskStatus.COUNT,
        worker_name: "a ai translate worker",
        worker_status: "transcripting 70%",
      }
    }),
  };
}

// 搜索翻译任务
router.get('/translate',
  query('page').isInt({min: 1}),
  query('work_id').optional({nullable: true}).isInt(),
  query('file_name').optional({nullable: true}).isString(),
  query('status').isJSON(),
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const page = parseInt(req.query.page);
    const work_id = req.query.work_id || 0;
    const file_name = req.query.file_name || '';
    const status = JSON.parse(req.query.status || '[]');
    const offset = (page - 1) * PAGE_SIZE;

    try {
      console.log(`ai_translate search, page = ${page}, work_id = ${work_id}, file_name = ${file_name}, status = ${status}`)

      const query = () => db.getTranslateTasks(work_id, file_name, status);
      const totalCount = await query().count('t_translate_task.id as count');
      let tasks = await query().offset(offset).limit(PAGE_SIZE).orderBy([{ column: 't_translate_task.updated_at', order: 'desc'}]);

      res.send({
        pagination: {
          currentPage: page,
          pageSize: PAGE_SIZE,
          totalCount: totalCount[0]['count'],
        },
        tasks,
      });

    } catch(err) {
      res.status(500).send({error: '查询过程中出错'});
      console.error(err);
    }
});

// 创建翻译任务
router.put('/translate/:id/:index', 
  param('id').isInt(),
  param('index').isInt(),
  async (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    const work_id = req.params.id;
    const file_id = req.params.index;

    let work = null;
    try {
      work = await db.knex('t_work').select('root_folder', 'dir').where('id', '=', work_id).first()
    } catch (err) { next(err); return; }

    const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
    if (!rootFolder) {
      res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器`});
      return;
    }

    let filePath = "";
    let audioPath = "";
    try {
      const workDir = path.join(rootFolder.path, work.dir);
      const tracks = await getTrackList(work_id, workDir)
      const track = tracks[file_id];
      audioPath = path.join(track.subtitle || '', track.title)
      filePath = path.join(workDir, audioPath);
      if (!fs.existsSync(filePath)) {
        res.status(500).send({error: `找不到具体的音频文件: "${filePath}"，请尝试重启服务器`});
        return;
      }
    } catch (err) {
      res.status(500).send({error: err.message});
      return;
    }

    try {
      const ids = await db.createTranslateTask(work_id, audioPath);
      res.send({ id: ids[0] })
    } catch (err) {
      res.status(500).send({error: err.message});
      return;
    }
  }
)

// 删除翻译任务
router.delete('/translate/:id',
  param('id').isInt(),
  async function(req, res, next) {
    if(!isValidRequest(req, res)) return;

    const id = parseInt(req.params.id);
    try {
      const counts = await db.knex('t_translate_task').select('*').where('id', '=', id).first().del()
      const lyric_path = path.join(config.lyricFolderDir, `${id}.lrc`);
      if (fs.existsSync(lyric_path)) {
        fs.unlinkSync(lyric_path);
      }
      res.send({ counts });
    } catch (err) {
      res.status(500).send({error: "删除翻译任务失败：" + err.message})
    }
  }
)

// 重试翻译任务
router.post('/translate/redo/:id',
  param('id').isInt(),
  async function(req, res, next) {
    if(!isValidRequest(req, res)) return;

    const id = parseInt(req.params.id);
    try {
      const counts = await db.knex('t_translate_task').where('id', '=', id).update({
        status: AILyricTaskStatus.PENDING,
        worker_name: "",
        worker_status: "",
        secret: "",
      });
      res.send({ counts });
    } catch (err) {
      res.status(500).send({error: "重试翻译任务失败：" + err.message})
    }
  } 
)

// 申请翻译任务，返回任务id和secret
router.post('/translate/acquire', 
  body('worker_name').isString(),
  async function(req, res, next) {
    if(!isValidRequest(req, res)) return;
    const worker_name = req.body.worker_name;
    // console.log('translation worker try acquire task:', worker_name)

    try {
      const secret = crypto.randomBytes(32).toString('hex')
      const count = await db.knex('t_translate_task')
        .where(
          'id', '=',
          // select one pending task ordered by updated time
          db.knex('t_translate_task')
            .select('id')
            .where('status', '=', AILyricTaskStatus.PENDING)
            .orderBy([{ column: 't_translate_task.updated_at', order: 'desc'}])
            .first()
        )
        .update({
          status: AILyricTaskStatus.TRASCRIPTING,
          worker_name,
          worker_status: "task acquired",
          secret,
        })
        // .returning('id'); // returning is not working on current version of sqlite3

      if (count == 0) {
        res.status(404).send({error: "无待认领的翻译任务"})
        return;
      }

      // returning will not working, so we must use secret as a unique key to get the updated task
      const task = await db.knex('t_translate_task')
        .select('id', 'audio_path')
        .where('secret', '=', secret)
        .first();

      res.send({ id: task.id, secret, audio_ext: path.extname(task.audio_path) });
    } catch(err) {
      res.status(500).send({error: "申请翻译任务失败：" + err.message});
    }
  }
)

// worker更新翻译任务状态，比如已经翻译了多少
router.post('/translate/status', 
  body('id').isString(),
  body('secret').isString(),
  body('worker_status').isString(),
  async function(req, res, next) {
    if(!isValidRequest(req, res)) return;
    const id = req.body.id;
    const secret = req.body.secret;
    const worker_status = req.body.worker_status;

    try {
      const count = await db.knex('t_translate_task')
        .where('id', '=', 
          db.knex('t_translate_task')
            .select('id')
            .where('id', '=', id)
            .where('secret', '=', secret)
            .where('status', '=', AILyricTaskStatus.TRASCRIPTING)
            .first()
        ).update({
          worker_status
        });
      res.send({ success: count == 1 })
    } catch(err) {
      console.log(err.message)
      res.status(500).send({success: false, error: "申请翻译任务失败：" + err.message})
    }
  }
)

router.get('/translate/download', 
  query('id').isInt(),
  query('secret').isString(),
  async function(req, res, next) {
    const task_id = req.query.id;
    const secret = req.query.secret;

    try {
      const task = await db.knex('t_translate_task')
        .select('t_translate_task.audio_path', 't_work.root_folder', 't_work.dir')
        .leftJoin('t_work', 't_translate_task.work_id', 't_work.id')
        .where('t_translate_task.id', '=', task_id)
        .where('t_translate_task.secret', '=', secret)
        .first();
    
        const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === task.root_folder);

      if (rootFolder) {
        // Offload from express, 302 redirect to a virtual directory in a reverse proxy like Nginx
        if (config.offloadMedia) {
          // Path controlled by config.offloadMedia and config.offloadDownloadPath
          // By default: /media/download/VoiceWork/RJ123456/subdirs/track.mp3
          // If the folder is deeper: /media/download/VoiceWork/second/RJ123456/subdirs/track.mp3
          const baseUrl = config.offloadDownloadPath;
          let offloadUrl = joinFragments(baseUrl, rootFolder.name, task.dir, task.audio_path);
          if (process.platform === 'win32') {
            offloadUrl = offloadUrl.replace(/\\/g, '/');
          }

          // Note: you should set 'Content-Disposition: attachment' header in your reverse proxy for the download virtual directory
          // By default the directory is /media/download
          res.redirect(offloadUrl);
        } else {
          // By default, serve file through express
          res.download(path.join(rootFolder.path, work.dir, work.audio_path));
        }
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    } catch (err) {
      res.status(404).send({error: `下载翻译音频文件失败 ${err.message}`});
    }
  }
)

// 翻译完成，或者翻译失败
router.post('/translate/finish', 
  body('id').isInt(),
  body('secret').isString(),
  body('success').isBoolean(),
  body('lrc_content').isString(),
  async function(req, res, next) {
    console.log("translate finished called")
    if(!isValidRequest(req, res)) return;
    console.log("translate finished is valid")

    const id = req.body.id;
    const secret = req.body.secret;
    const success = req.body.success;
    const lrc_content = req.body.lrc_content || "";
    console.log("translate finished: ", id, success)

    try {
      const task = await db.knex('t_translate_task')
            .select('id')
            .where('id', '=', id)
            .where('secret', '=', secret)
            .where('status', '=', AILyricTaskStatus.TRASCRIPTING)
            .first();
      if (!task) { res.status(404).send({error: "没有找到指定的任务"}); return; }

      if (success) {
        // 存储字幕
        const lyricFolder = config.lyricFolderDir;
        if (!fs.existsSync(lyricFolder)) {
          fs.mkdirSync(lyricFolder, { recursive: true });
        }
        
        const lyric_path = path.join(lyricFolder, `${task.id}.lrc`);
        fs.writeFileSync(lyric_path, lrc_content) // overwrite
        console.log("save lrc to: ", lyric_path)

        await db.knex('t_translate_task')
          .where('id', '=', id)
          .update({ status: AILyricTaskStatus.SUCCESS });
      } else {
        await db.knex('t_translate_task')
          .where('id', '=', id)
          .update({ status: AILyricTaskStatus.ERROR });
      }
      res.send({})
    } catch(err) {
      console.log(err.message, err.stack)
      res.status(500).send({success: false, error: "申请翻译任务失败：" + err.message})
    }
  }
)

module.exports = router;
