const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  initiateOrderPayment, initiateSubscriptionPayment,
  orderPaymentCallback, subscriptionPaymentCallback,
  checkPaymentStatus,
} = require('../controllers/mpesaController');

router.post('/order', authenticate, authorize('customer'), initiateOrderPayment);
router.post('/subscription', authenticate, authorize('vendor'), initiateSubscriptionPayment);
router.post('/callback/order', orderPaymentCallback);
router.post('/callback/subscription', subscriptionPaymentCallback);
router.get('/status/:checkoutRequestId', authenticate, checkPaymentStatus);

module.exports = router;
