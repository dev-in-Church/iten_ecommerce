const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const {
  initializePayment,
  verifyPayment,
  webhookCallback,
  chargeCard,
} = require("../controllers/paystackController");
const { query } = require("../config/database");
const router = express.Router();

// Paystack payment routes
router.post(
  "/paystack-init",
  authenticate,
  authorize("customer"),
  initializePayment,
);
router.get(
  "/paystack-verify",
  authenticate,
  authorize("customer"),
  verifyPayment,
);
router.post("/paystack-callback", webhookCallback);
router.post(
  "/paystack-charge",
  authenticate,
  authorize("customer"),
  chargeCard,
);

// Process card payment (kept for backward compatibility - use Paystack)
router.post("/card", authenticate, authorize("customer"), async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }

    // Use Paystack initialization instead
    return res
      .status(400)
      .json({
        error:
          "Please use Paystack payment gateway. Call /api/payments/paystack-init instead.",
      });
  } catch (err) {
    console.error("Card payment error:", err);
    res.status(500).json({ error: "Payment processing failed." });
  }
});

// Process COD order confirmation
router.post("/cod", authenticate, authorize("customer"), async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }

    // Get order
    const orderRes = await query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id],
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }

    // For COD, we don't create a payment record until delivery
    // Just update the order to confirmed
    await query(
      "UPDATE orders SET payment_method = 'cod', status = 'confirmed', updated_at = NOW() WHERE id = $1",
      [orderId],
    );

    res.json({
      success: true,
      message:
        "Cash on Delivery order confirmed. Payment will be collected upon delivery.",
    });
  } catch (err) {
    console.error("COD order error:", err);
    res.status(500).json({ error: "Order confirmation failed." });
  }
});

module.exports = router;
