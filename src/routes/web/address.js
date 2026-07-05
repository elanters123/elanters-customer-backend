const router = require('express').Router();
const { suggest, resolvePlace, reverse } = require('../../controllers/addressController');

router.get('/suggest', suggest);
router.get('/place', resolvePlace);
router.get('/reverse', reverse);

module.exports = router;
