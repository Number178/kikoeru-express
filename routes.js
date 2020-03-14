const path = require('path');
const express = require('express');
const db = require('./database/db');
const { getTrackList } = require('./filesystem/utils');

const config = require('./config.json');

const router = express.Router()

// GET work cover image
router.get('/cover/:id', (req, res, next) => {
  const rjcode = (`000000${req.params.id}`).slice(-6);
  res.sendFile(path.join(config.rootDir, 'Images', `RJ${rjcode}.jpg`), (err) => {
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
    .select('dir')
    .where('id', '=', req.params.id)
    .first()
    .then((dir) => {
      getTrackList(req.params.id, dir.dir)
        .then(tracks => res.send(tracks));
    })
    .catch(err => next(err));
});

// GET (stream) a specific track from work folder
router.get('/stream/:id/:index', (req, res, next) => {
  db.knex('t_work')
    .select('dir')
    .where('id', '=', req.params.id)
    .first()
    .then((dir) => {
      getTrackList(req.params.id, dir.dir)
        .then((tracks) => {
          const track = tracks[req.params.index];
          res.sendFile(path.join(config.rootDir, dir.dir, track.subtitle || '', track.title));
        })
        .catch(err => next(err));
    });
});

// GET list of work ids
router.get('/works/:fromId?', (req, res, next) => {
  db.paginateResults(db.getWorksBy(), req.params.fromId || 999999, config.worksPerPage)
    .then(results => res.send(results))
    .catch(err => next(err));
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

router.get('/search/:keyword/:fromId?', (req, res, next) => {
  db.paginateResults(
    db.getWorksByKeyWord(req.params.keyword),
    req.params.fromId || 999999, config.worksPerPage,
  )
    .then(results => res.send(results))
    .catch(err => next(err));
});

// GET list of work ids, restricted by circle/tag/VA
router.get('/:field/:id/:fromId?', (req, res, next) => {
  db.paginateResults(
    db.getWorksBy(req.params.id, req.params.field),
    req.params.fromId || 999999, config.worksPerPage,
  )
    .then(results => res.send(results))
    .catch(err => next(err));
});

// GET list of circles/tags/VAs
router.get('/(:field)s/', (req, res, next) => {
  db.knex(`t_${req.params.field}`)
    .select('id', 'name')
    .orderBy('name', 'asc')
    .then(list => res.send(list))
    .catch(err => next(err));
});


module.exports = router;
