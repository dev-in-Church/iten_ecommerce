const express = require('express');
const router = express.Router();
const { getProducts, getProduct, getCategories, getFeaturedProducts } = require('../controllers/productController');

router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/categories', getCategories);
router.get('/:slug', getProduct);

module.exports = router;
