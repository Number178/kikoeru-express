const express = require('express');
const { getWritebackConfig, matchesWritebackKey } = require('../auth/kikoetaWriteback');
const router = express.Router();
const { config } = require('../config');
const db = require('../database/db');
const { param } = require('express-validator');
const fs = require('fs');
const path = require('path');
const jschardet = require('jschardet');
const { getTrackList, supportedMediaExtList } = require('../filesystem/utils');
const { KIKOETA_LYRIC_SUFFIX, trackPathParts, writeTrackLyric } = require('../filesystem/kikoetaLyrics');
const { joinFragments } = require('./utils/url')
const { isValidRequest } = require('./utils/validate')
const jimp = require("jimp")

// GET (stream) a specific track from work folder
router.get('/stream/:id/:index',
  param('id').isInt(),
  param('index').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    db.knex('t_work')
      .select('root_folder', 'dir', 'memo')
      .where('id', '=', req.params.id)
      .first()
      .then((work) => {
        const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
        if (rootFolder) {
          getTrackList(req.params.id, path.join(rootFolder.path, work.dir), JSON.parse(work.memo))
            .then((tracks) => {
              const track = tracks[req.params.index];

              const fileName = path.join(rootFolder.path, work.dir, track.subtitle || '', track.title);
              const extName = path.extname(fileName).toLocaleLowerCase();
              if (extName === '.txt' || extName === '.lrc') {
                const fileBuffer = fs.readFileSync(fileName);
                const charsetMatch = jschardet.detect(fileBuffer).encoding;
                if (charsetMatch) {
                  res.setHeader('Content-Type', `text/plain; charset=${charsetMatch}`);
                }
              }
              if (extName === '.flac') {
                // iOS不支持audio/x-flac
                res.setHeader('Content-Type', `audio/flac`);
              }

              // Offload from express, 302 redirect to a virtual directory in a reverse proxy like Nginx
              // Only redirect media files, not including text files and lrcs because we need charset detection
              // so that the browser properly renders them
              if (config.offloadMedia && extName !== '.txt' && extName !== '.lrc') {
                // Path controlled by config.offloadMedia and config.offloadStreamPath
                // By default: /media/stream/VoiceWork/RJ123456/subdirs/track.mp3
                // If the folder is deeper: /media/stream/VoiceWork/second/RJ123456/subdirs/track.mp3
                const baseUrl = config.offloadStreamPath;
                let offloadUrl = joinFragments(baseUrl, rootFolder.name, work.dir, track.subtitle || '', track.title);
                if (process.platform === 'win32') {
                  offloadUrl = offloadUrl.replace(/\\/g, '/');
                }

                res.redirect(offloadUrl);
              } else {
                // By default, serve file through express
                res.sendFile(fileName);
              }
            })
            .catch(err => next(err));
        } else {
          res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
        }
      })
      .catch(err => next(err));
});

router.get('/download/:id/:index',
  param('id').isInt(),
  param('index').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    db.knex('t_work')
      .select('root_folder', 'dir', 'memo')
      .where('id', '=', req.params.id)
      .first()
      .then((work) => {
        const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
        if (rootFolder) {
          getTrackList(req.params.id, path.join(rootFolder.path, work.dir), JSON.parse(work.memo))
            .then((tracks) => {
              const track = tracks[req.params.index];

              // Offload from express, 302 redirect to a virtual directory in a reverse proxy like Nginx
              if (config.offloadMedia) {
                // Path controlled by config.offloadMedia and config.offloadDownloadPath
                // By default: /media/download/VoiceWork/RJ123456/subdirs/track.mp3
                // If the folder is deeper: /media/download/VoiceWork/second/RJ123456/subdirs/track.mp3
                const baseUrl = config.offloadDownloadPath;
                let offloadUrl = joinFragments(baseUrl, rootFolder.name, work.dir, track.subtitle || '', track.title);
                if (process.platform === 'win32') {
                  offloadUrl = offloadUrl.replace(/\\/g, '/');
                }

                // Note: you should set 'Content-Disposition: attachment' header in your reverse proxy for the download virtual directory
                // By default the directory is /media/download
                res.redirect(offloadUrl);
              } else {
                // By default, serve file through express
                res.download(path.join(rootFolder.path, work.dir, track.subtitle || '', track.title));
              }
            })
            .catch(err => next(err));
        } else {
          res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
        }
      });
});

function writebackError(res, status, code) {
  return res.set('X-Kikoeru-Writeback-Error', code).status(status).send({ code });
}

function allowKikoetaLyrics(req, res, next) {
  const { enabled, keyHash, authMode } = getWritebackConfig(config);
  if (!enabled) return writebackError(res, 404, 'writeback_disabled');
  if (config.auth) {
    if (!req.user) return writebackError(res, 401, 'login_required');
    if (!['user', 'administrator'].includes(req.user.group)) return writebackError(res, 403, 'role_forbidden');
    if (authMode === 'account_and_key') {
      if (!keyHash) return writebackError(res, 503, 'writeback_unconfigured');
      if (!matchesWritebackKey(req.get('X-Kikoeru-Writeback-Key'), keyHash)) {
        return writebackError(res, 403, 'key_invalid');
      }
    }
  }
  next();
}

router.get('/kikoeta-lyrics/capabilities', (req, res) => {
  const { enabled, authMode } = getWritebackConfig(config);
  res.set('Cache-Control', 'no-store').send({
    version: 3, enabled, authentication: config.auth ? authMode : 'none',
  });
});

router.head('/kikoeta-lyrics', allowKikoetaLyrics, (req, res) =>
  res.set('X-Kikoeru-Lyrics-Writeback', '2').sendStatus(204));

router.put('/kikoeta-lyrics/:id',
  allowKikoetaLyrics,
  param('id').isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  express.text({ limit: '8mb' }),
  async (req, res, next) => {
    if (!isValidRequest(req, res)) return;
    const parts = trackPathParts(req.query.trackPath);
    if (!parts || !supportedMediaExtList.includes(path.extname(parts[parts.length - 1]).toLowerCase())
        || typeof req.body !== 'string' || !req.body.trim()) {
      return res.status(400).send({ code: 'invalid_request' });
    }
    try {
      const work = await db.knex('t_work').select('root_folder', 'dir').where('id', req.params.id).first();
      const root = work && config.rootFolders.find(folder => folder.name === work.root_folder);
      if (!root || !await writeTrackLyric(root.path, work.dir, parts, req.body)) return res.status(404).send({ code: 'source_unavailable' });
      await db.updateWorkAILyricStatus(true, '', req.params.id);
      return res.sendStatus(204);
    } catch (err) {
      if (err.code === 'EEXIST') return res.status(409).send({ code: 'lyrics_conflict' });
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return res.status(404).send({ code: 'source_unavailable' });
      if (['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(err.code)) {
        return res.status(503).send({ code: 'directory_unwritable' });
      }
      return next(err);
    }
  }
);

router.get('/check-lrc/:id/:index',
  param('id').isInt(),
  param('index').isInt(),
  (req, res, next) => {
    if(!isValidRequest(req, res)) return;

    db.knex('t_work')
      .select('root_folder', 'dir', 'memo')
      .where('id', '=', req.params.id)
      .first()
      .then((work) => {
        const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
        if (rootFolder) {
          getTrackList(req.params.id, path.join(rootFolder.path, work.dir), JSON.parse(work.memo))
            .then((tracks) => {
              const track = tracks[req.params.index];
              const fileLoc = path.join(rootFolder.path, work.dir, track.subtitle || '', track.title);
              const fileDir = path.join(rootFolder.path, work.dir, track.subtitle || '');



              let foundLyricFileName = "";
              let foundLyricExtension = "";
              const supportedLyricExtensions = [".lrc", ".srt", ".vtt"];
              const trackTitle = track.title;
              for (const ext of supportedLyricExtensions) {
                // 几种不同的查找歌词文件的方式
                const tryFileLocs = [
                  trackTitle.substring(0, trackTitle.lastIndexOf(".")) + ext, // sometitle.mp3 -> sometitle.lrc
                  trackTitle.substring(0, trackTitle.lastIndexOf(".")) + ext.toUpperCase(), // sometitle.mp3 -> sometitle.LRC
                  trackTitle + ext, // sometitle.mp3 -> sometitle.mp3.lrc
                  trackTitle + ext.toUpperCase(), // sometitle.mp3 -> sometitle.mp3.LRC
                ];
                for (const tryFileLoc of tryFileLocs) {
                  console.log(`尝试查找歌词文件：${tryFileLoc}`)
                  if (fs.existsSync(path.join(fileDir, tryFileLoc))) {
                    foundLyricFileName = tryFileLoc;
                    break;
                  }
                }
                if (foundLyricFileName != "") {
                  foundLyricExtension = ext;
                  break;
                }
              }

              if (!foundLyricFileName && fs.existsSync(path.join(fileDir, trackTitle + KIKOETA_LYRIC_SUFFIX))) {
                foundLyricFileName = trackTitle + KIKOETA_LYRIC_SUFFIX;
                foundLyricExtension = '.lrc';
              }

              if (foundLyricFileName != "") {
                console.log('找到歌词文件');
                const subtitleToFind = track.subtitle;
                console.log('歌词文件名： ', foundLyricFileName);
                // 文件名、子目录名相同
                tracks.forEach(trackItem => {
                  if (trackItem.title === foundLyricFileName && subtitleToFind === trackItem.subtitle) {
                      res.send({result: true, message:'找到歌词文件', hash: trackItem.hash, lyricExtension: foundLyricExtension});
                  }
                })
              } else {
                res.send({result: false, message:'不存在歌词文件', hash: ''});
              }
            })
            .catch(err => next(err));
        } else {
          res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
        }
      })
      .catch(err => next(err));
});

// GET (stream) a specific track from work folder
router.get('/small-img/:id/:index',
  param('id').isInt(),
  param('index').isInt(),
  async (req, res) => {
    if(!isValidRequest(req, res)) return;
    const work = await db.knex('t_work')
      .select('root_folder', 'dir')
      .where('id', '=', req.params.id)
      .first();
    const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
    if (rootFolder) {
      const tracks = await getTrackList(req.params.id, path.join(rootFolder.path, work.dir));
      const track = tracks[req.params.index];
      const fileName = path.join(rootFolder.path, work.dir, track.subtitle || '', track.title);
      const extName = path.extname(fileName).toLowerCase();
      if ([".jpg", ".png", ".bmp"].includes(extName)) {
        const img = await jimp.read(fileName);
        const scaledBuf = await img.scaleToFit(64, 64).getBufferAsync(jimp.MIME_JPEG);
        res.setHeader('content-type', 'image/jpeg');
        res.send(scaledBuf);
      } else if (".webp" === extName) {
        // jimp 不支持webp格式的图像，这里直接发送原始图像文件
        res.sendFile(fileName);
      } else {
        res.status(500).send({error: `获取小图像失败，不支持的图像格式"${extName}"`});
      }
    } else {
      res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
    }
});

module.exports = router;
