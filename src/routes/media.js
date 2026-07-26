const router = require('express').Router();
const { getProductImage } = require('../controllers/mediaController');

router.get('/product-images/:id', getProductImage);

module.exports = router;
