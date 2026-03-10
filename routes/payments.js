const express = require("express");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const router = express.Router();

// Process card payment (simulated for now)
router.post("/card", authenticate, authorize("customer"), async (req, res) => {
  try {
    const { orderId, cardLast4 } = req.body;

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

    const order = orderRes.rows[0];

    if (order.payment_status === "paid") {
      return res.status(400).json({ error: "Order already paid." });
    }

    // Create payment record
    const paymentRes = await query(
      `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, status, description, metadata)
       VALUES ($1, $2, 'order', $3, $4, 'completed', 'Card payment', $5) RETURNING *`,
      [
        req.user.id,
        orderId,
        order.total,
        "KES",
        JSON.stringify({ cardLast4, method: "card" }),
      ],
    );

    // Update order payment status AND order status to confirmed
    await query(
      "UPDATE orders SET payment_status = 'paid', payment_method = 'card', status = 'confirmed', updated_at = NOW() WHERE id = $1",
      [orderId],
    );

    res.json({
      success: true,
      payment: paymentRes.rows[0],
      message: "Card payment processed successfully.",
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
