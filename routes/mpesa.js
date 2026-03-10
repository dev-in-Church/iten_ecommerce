const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  initiateOrderPayment,
  orderPaymentCallback,
  retryOrderPayment,
  checkPaymentStatus,
  queryPaymentStatus,
} = require("../controllers/mpesaController");

// Customer order payments
router.post(
  "/order-payment",
  authenticate,
  authorize("customer"),
  initiateOrderPayment,
);
router.post(
  "/retry-payment",
  authenticate,
  authorize("customer"),
  retryOrderPayment,
);

// M-Pesa callbacks (no auth - called by Safaricom)
router.post("/callback/order", orderPaymentCallback);

// Payment status
router.get("/status/:checkoutRequestId", authenticate, checkPaymentStatus);
router.get("/query/:checkoutRequestId", authenticate, queryPaymentStatus);

module.exports = router;
