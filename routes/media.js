const express = require('express');
const router = express.Router();
const { config } = require('../config');
const db = require('../database/db');
const fs = require('fs');
const path = require('path');
const jschardet = require('jschardet');
const { getTrackList } = require('../filesystem/utils');

// GET (stream) a specific track from work folder
router.get('/stream/:id/:index', (req, res, next) => {
  db.knex('t_work')
    .select('root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (rootFolder) {
        getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
          .then((tracks) => {
            const track = tracks[req.params.index];

            const fileName = path.join(rootFolder.path, work.dir, track.subtitle || '', track.title);
            if (path.extname(fileName) === '.txt' || path.extname(fileName) === '.lrc') {
              const fileBuffer = fs.readFileSync(fileName);
              const charsetMatch = jschardet.detect(fileBuffer).encoding;
              if (charsetMatch) {
                res.setHeader('Content-Type', `text/plain; charset=${charsetMatch}`);
              }
            }
            if (path.extname(fileName) === '.flac') {
              // iOS不支持audio/x-flac
              res.setHeader('Content-Type', `audio/flac`);
            }
            res.sendFile(fileName);
          })
          .catch(err => next(err));
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    });
});

router.get('/download/:id/:index', (req, res, next) => {
  db.knex('t_work')
    .select('root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (rootFolder) {
        getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
          .then((tracks) => {
            const track = tracks[req.params.index];
            res.download(path.join(rootFolder.path, work.dir, track.subtitle || '', track.title));
          })
          .catch(err => next(err));
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    });
});

router.get('/check-lrc/:id/:index', (req, res, next) => {
  db.knex('t_work')
    .select('root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (rootFolder) {
        getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
          .then((tracks) => {
            const track = tracks[req.params.index];
            const fileLoc = path.join(rootFolder.path, work.dir, track.subtitle || '', track.title);
            const lrcFileLoc = fileLoc.substr(0, fileLoc.lastIndexOf(".")) + ".lrc";

            if (!fs.existsSync(lrcFileLoc)) {
              res.send({result: false, message:'不存在歌词文件', hash: ''});
            } else {
              console.log('找到歌词文件');             
              const lrcFileName = track.title.substr(0, track.title.lastIndexOf(".")) + ".lrc";
              const subtitleToFind = track.subtitle;
              console.log('歌词文件名： ', lrcFileName);
              // 文件名、子目录名相同
              tracks.forEach(trackItem => {
                if (trackItem.title === lrcFileName && subtitleToFind === trackItem.subtitle) {
                    res.send({result: true, message:'找到歌词文件', hash: trackItem.hash});
                }
              })
            }
          })
          .catch(err => next(err));
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    });
});

module.exports = router;