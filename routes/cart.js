const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getCart, addToCart, updateCartItem, removeFromCart, clearCart, syncCart } = require('../controllers/cartController');

router.get('/', authenticate, authorize('customer'), getCart);
router.post('/', authenticate, authorize('customer'), addToCart);
router.put('/:id', authenticate, authorize('customer'), updateCartItem);
router.delete('/:id', authenticate, authorize('customer'), removeFromCart);
router.delete('/', authenticate, authorize('customer'), clearCart);
router.post('/sync', authenticate, authorize('customer'), syncCart);

module.exports = router;
