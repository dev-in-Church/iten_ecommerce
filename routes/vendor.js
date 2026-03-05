const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDashboard, getVendorProducts, createProduct, updateProduct, deleteProduct,
  getVendorOrders, updateOrderItemStatus, getSubscriptionStatus, updateVendorProfile,
} = require('../controllers/vendorController');

router.get('/dashboard', authenticate, authorize('vendor'), getDashboard);
router.get('/products', authenticate, authorize('vendor'), getVendorProducts);
router.post('/products', authenticate, authorize('vendor'), createProduct);
router.put('/products/:id', authenticate, authorize('vendor'), updateProduct);
router.delete('/products/:id', authenticate, authorize('vendor'), deleteProduct);
router.get('/orders', authenticate, authorize('vendor'), getVendorOrders);
router.put('/orders/:id/status', authenticate, authorize('vendor'), updateOrderItemStatus);
router.get('/subscriptions', authenticate, authorize('vendor'), getSubscriptionStatus);
router.put('/profile', authenticate, authorize('vendor'), updateVendorProfile);

module.exports = router;
