const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  customerRegister, customerLogin, vendorRegister, vendorLogin,
  adminLogin, googleAuth, getMe, logout, updateProfile
} = require('../controllers/authController');

// Customer auth
router.post('/customer/register', customerRegister);
router.post('/customer/login', customerLogin);

// Vendor auth
router.post('/vendor/register', vendorRegister);
router.post('/vendor/login', vendorLogin);

// Admin auth (login only)
router.post('/admin/login', adminLogin);

// Google OAuth
router.post('/google', googleAuth);

// Protected routes
router.get('/me', authenticate, getMe);
router.post('/logout', logout);
router.put('/profile', authenticate, updateProfile);

module.exports = router;
