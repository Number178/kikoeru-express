const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.send('OK');
})

// Eliminate error message from old PWA
// Will be deleted in the future
router.get('/me', (req, res) => {
  res.redirect('/api/auth/me');
})

router.use('/auth', require('./auth'));
router.use('/credentials', require('./credentials'));
router.use('/version', require('./version'));
router.use('/config', require('./config'));
router.use('/media', require('./media'));
router.use('/review', require('./review'));
router.use('/histroy', require('./play_histroy'));
router.use('/lyric', require('./translate'))
// Other routes
router.use('/', require('./metadata'));

module.exports = router;