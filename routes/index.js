const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/credentials', require('./credentials'));
router.use('/version', require('./version'));
router.use('/config', require('./config'));
router.use('/media', require('./media'));
router.use('/review', require('./review'));
// Other routes
router.use('/', require('./metadata'));

module.exports = router;