const fs = require('fs');
const jschardet = require('jschardet');
const path = require('path');
const express = require('express');

const db = require('./database/db');
const { getTrackList, toTree } = require('./filesystem/utils');

const { getConfig } = require('./config');
const config = getConfig();

const PAGE_SIZE = config.pageSize || 12;
const router = express.Router();

// GET work cover image
router.get('/cover/:id', (req, res, next) => {
  const rjcode = (`000000${req.params.id}`).slice(-6);
  const type = req.query.type || 'main'; // 'main' or 'sam'
  res.sendFile(path.join(config.coverFolderDir, `RJ${rjcode}_img_${type}.jpg`), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, './static/no-image.jpg'), (err2) => {
        if (err2) {
          next(err2);
        }
      });
    }
  });
});

// GET work metadata
router.get('/work/:id', (req, res, next) => {
  db.getWorkMetadata(req.params.id)
    .then(work => res.send(work))
    .catch(err => next(err));
});

// GET track list in work folder
router.get('/tracks/:id', (req, res, next) => {
  db.knex('t_work')
    .select('title', 'root_folder', 'dir')
    .where('id', '=', req.params.id)
    .first()
    .then((work) => {
      const rootFolder = config.rootFolders.find(rootFolder => rootFolder.name === work.root_folder);
      if (rootFolder) {
        getTrackList(req.params.id, path.join(rootFolder.path, work.dir))
          .then(tracks => res.send(toTree(tracks, work.title)));
      } else {
        res.status(500).send({error: `找不到文件夹: "${work.root_folder}"，请尝试重启服务器或重新扫描.`});
      }
    })
    .catch(err => next(err));
});

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
              //console.log('不存在歌词文件');
              res.send({result: false, message:'不存在歌词文件', hash: ''});
            } else {
              console.log('找到歌词文件');
              
              const lrcFileName = track.title.substr(0, track.title.lastIndexOf(".")) + ".lrc";
              const subtitleToFind = track.subtitle;
              console.log('歌词文件名： ', lrcFileName);
              tracks.forEach(trackItem => {
                if (trackItem.title === lrcFileName && subtitleToFind === trackItem.subtitle) {
                    console.log(trackItem.hash);
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

// GET list of work ids
router.get('/works', async (req, res, next) => {
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc';
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksBy();
    const totalCount = await query().count('id as count');

    let works = null;
    if (order === 'nsfw') {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy([{ column: 'nsfw', order: sort }, { column: 'release', order: 'desc' }]);
    }
    else {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);
    }

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET name of a circle/tag/VA
router.get('/get-name/:field/:id', (req, res, next) => {
  if (req.params.field === 'undefined') {
    return res.send(null);
  }

  return db.knex(`t_${req.params.field}`)
    .select('name')
    .where('id', '=', req.params.id)
    .first()
    .then(name => res.send(name.name))
    .catch(err => next(err));
});

router.get('/search/:keyword?', async (req, res, next) => {
  const keyword = req.params.keyword ? req.params.keyword.trim() : '';
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  const order = req.query.order || 'release';
  const sort = req.query.sort || 'desc';
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksByKeyWord(keyword);
    const totalCount = await query().count('id as count');

    let works = null;
    if (order === 'nsfw') {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy([{ column: 'nsfw', order: sort }, { column: 'release', order: 'desc' }]);
    }
    else {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);
    }

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET list of work ids, restricted by circle/tag/VA
router.get('/:field/:id', async (req, res, next) => {
  const currentPage = parseInt(req.query.page) || 1;
  // 通过 "音声id, 贩卖日, 售出数, 评论数量, 价格, 平均评价" 排序
  // ['id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp']
  let order = req.query.order || 'release';
  const sort = req.query.sort || 'desc'; // ['desc', 'asc]
  const offset = (currentPage - 1) * PAGE_SIZE;
  
  try {
    const query = () => db.getWorksBy(req.params.id, req.params.field);
    const totalCount = await query().count('id as count');

    let works = null;
    if (order === 'nsfw') {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy([{ column: 'nsfw', order: sort }, { column: 'release', order: 'desc' }]);
    }
    else {
      works = await query().offset(offset).limit(PAGE_SIZE).orderBy(order, sort);
    }

    res.send({
      works,
      pagination: {
        currentPage,
        pageSize: PAGE_SIZE,
        totalCount: totalCount[0]['count']
      }
    });
  } catch(err) {
    next(err);
  }
});

// GET list of circles/tags/VAs
router.get('/(:field)s/', (req, res, next) => {
  const field = req.params.field;
  db.getLabels(field)
    .orderBy(`name`, 'asc')
    .then(list => res.send(list))
    .catch(err => next(err));
});


module.exports = router;
