const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDashboard, getUsers, toggleUserStatus,
  getVendors, verifyVendor, unverifyVendor,
  getAllOrders, updateOrderStatus,
  getAllPayments, getAllProducts, toggleProductStatus, toggleProductFeatured,
  getAllSubscriptions,
} = require('../controllers/adminController');

const admin = [authenticate, authorize('admin')];

router.get('/dashboard', ...admin, getDashboard);
router.get('/users', ...admin, getUsers);
router.put('/users/:id/toggle', ...admin, toggleUserStatus);
router.get('/vendors', ...admin, getVendors);
router.put('/vendors/:id/verify', ...admin, verifyVendor);
router.put('/vendors/:id/unverify', ...admin, unverifyVendor);
router.get('/orders', ...admin, getAllOrders);
router.put('/orders/:id', ...admin, updateOrderStatus);
router.get('/payments', ...admin, getAllPayments);
router.get('/products', ...admin, getAllProducts);
router.put('/products/:id/toggle', ...admin, toggleProductStatus);
router.put('/products/:id/featured', ...admin, toggleProductFeatured);
router.get('/subscriptions', ...admin, getAllSubscriptions);

module.exports = router;
