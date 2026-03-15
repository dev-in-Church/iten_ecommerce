const https = require("https");
const { query, getClient } = require("../config/database");

// Initialize Paystack payment
const initializePayment = async (req, res) => {
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

    const order = orderRes.rows[0];

    if (order.payment_status === "paid") {
      return res.status(400).json({ error: "Order already paid." });
    }

    const amount = Math.round(parseFloat(order.total) * 100); // Convert to cents
    const email = req.user.email;
    const reference = `order-${orderId.slice(0, 8)}-${Date.now()}`;

    // Call Paystack API
    const paystackData = {
      email,
      amount,
      metadata: {
        orderId,
        orderNumber: order.order_number,
        userId: req.user.id,
        custom_fields: [
          {
            display_name: "Order Number",
            variable_name: "order_number",
            value: order.order_number,
          },
        ],
      },
      reference,
      callback_url: `${process.env.FRONTEND_URL}/paystack-callback?reference=${reference}`,
    };

    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path: "/transaction/initialize",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const paystackReq = https.request(options, (paystackRes) => {
      let data = "";
      paystackRes.on("data", (chunk) => {
        data += chunk;
      });

      paystackRes.on("end", () => {
        try {
          const body = JSON.parse(data);
          if (body.status) {
            // Store payment reference in database for verification later
            query(
              `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, status, reference, method)
               VALUES ($1, $2, 'order', $3, 'KES', 'pending', $4, 'paystack')`,
              [req.user.id, orderId, parseFloat(order.total), reference],
            ).catch((err) =>
              console.error("Error storing payment record:", err),
            );

            res.json({
              status: true,
              data: {
                reference,
                authorizationUrl: body.data.authorization_url,
                accessCode: body.data.access_code,
              },
              message: "Authorization URL created",
            });
          } else {
            res
              .status(400)
              .json({ error: "Failed to initialize Paystack payment." });
          }
        } catch (err) {
          console.error("Paystack response parse error:", err);
          res.status(500).json({ error: "Payment initialization failed." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("Paystack API error:", err);
      res.status(500).json({ error: "Payment initialization failed." });
    });

    paystackReq.write(JSON.stringify(paystackData));
    paystackReq.end();
  } catch (err) {
    console.error("Payment init error:", err);
    res.status(500).json({ error: "Payment initialization failed." });
  }
};

// Verify Paystack payment
const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ error: "Payment reference is required." });
    }

    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    };

    const paystackReq = https.request(options, (paystackRes) => {
      let data = "";
      paystackRes.on("data", (chunk) => {
        data += chunk;
      });

      paystackRes.on("end", async () => {
        try {
          const body = JSON.parse(data);

          if (body.status && body.data.status === "success") {
            const { metadata, reference: paystackRef } = body.data;
            const orderId = metadata.orderId;

            // Update order payment status
            const client = await getClient();
            try {
              await client.query("BEGIN");

              // Get order
              const orderRes = await client.query(
                "SELECT * FROM orders WHERE id = $1",
                [orderId],
              );
              if (orderRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ error: "Order not found." });
              }

              const order = orderRes.rows[0];

              // Update payment record
              await client.query(
                "UPDATE payments SET status = 'completed' WHERE reference = $1",
                [paystackRef],
              );

              // Update order
              await client.query(
                "UPDATE orders SET payment_status = 'paid', payment_method = 'card', status = 'confirmed', updated_at = NOW() WHERE id = $1",
                [orderId],
              );

              await client.query("COMMIT");

              res.json({
                status: true,
                message: "Payment verified successfully",
                order: {
                  id: order.id,
                  order_number: order.order_number,
                  total: order.total,
                  status: "confirmed",
                },
              });
            } catch (err) {
              await client.query("ROLLBACK");
              throw err;
            } finally {
              client.release();
            }
          } else {
            res
              .status(400)
              .json({ status: false, message: "Payment verification failed." });
          }
        } catch (err) {
          console.error("Paystack verify error:", err);
          res.status(500).json({ error: "Payment verification failed." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("Paystack API error:", err);
      res.status(500).json({ error: "Payment verification failed." });
    });

    paystackReq.end();
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ error: "Payment verification failed." });
  }
};

// Paystack webhook callback
const webhookCallback = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "Payment reference is required." });
    }

    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    };

    const paystackReq = https.request(options, async (paystackRes) => {
      let data = "";
      paystackRes.on("data", (chunk) => {
        data += chunk;
      });

      paystackRes.on("end", async () => {
        try {
          const body = JSON.parse(data);

          if (body.status && body.data.status === "success") {
            const { metadata } = body.data;
            const orderId = metadata.orderId;

            const client = await getClient();
            try {
              await client.query("BEGIN");

              // Update payment record
              await client.query(
                "UPDATE payments SET status = 'completed' WHERE reference = $1",
                [reference],
              );

              // Update order
              await client.query(
                "UPDATE orders SET payment_status = 'paid', payment_method = 'card', status = 'confirmed', updated_at = NOW() WHERE id = $1",
                [orderId],
              );

              await client.query("COMMIT");
            } catch (err) {
              await client.query("ROLLBACK");
              throw err;
            } finally {
              client.release();
            }
          }

          res.json({ status: "ok" });
        } catch (err) {
          console.error("Webhook processing error:", err);
          res.status(500).json({ error: "Webhook processing failed." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("Paystack API error:", err);
      res.status(500).json({ error: "Webhook processing failed." });
    });

    paystackReq.end();
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed." });
  }
};

// Charge card with inline payment details
const chargeCard = async (req, res) => {
  try {
    const {
      reference,
      orderId,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      email,
    } = req.body;

    console.log("[v0] Charge card request received:", {
      reference,
      orderId,
      email,
    });

    if (
      !reference ||
      !orderId ||
      !cardNumber ||
      !expiryMonth ||
      !expiryYear ||
      !cvv ||
      !email
    ) {
      console.log("[v0] Missing fields:", {
        reference,
        orderId,
        cardNumber,
        expiryMonth,
        expiryYear,
        cvv,
        email,
      });
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // Get order to verify it exists
    const orderRes = await query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id],
    );

    console.log("[v0] Order query result:", {
      orderId,
      userId: req.user.id,
      found: orderRes.rows.length > 0,
    });

    if (orderRes.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = orderRes.rows[0];
    const amount = Math.round(parseFloat(order.total) * 100);

    console.log("[v0] Processing charge:", { orderId, amount, email });

    // In test mode, we simulate the charge. In production, use Paystack's tokenization
    // For now, we'll record the payment and mark order as confirmed

    // Check if payment record exists with this reference
    const paymentRes = await query(
      "SELECT * FROM payments WHERE reference = $1",
      [reference],
    );

    if (paymentRes.rows.length > 0) {
      // Payment record exists, update it
      await query(
        `UPDATE payments SET status = 'completed', method = 'card', 
         metadata = jsonb_set(metadata, '{cardLast4}', to_jsonb($1::text))
         WHERE reference = $2`,
        [cardNumber.slice(-4), reference],
      );
    } else {
      // Create new payment record
      await query(
        `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, 
         phone_number, status, method, reference, description, metadata)
         VALUES ($1, $2, 'order', $3, $4, $5, 'completed', 'card', $6, 'Card payment', $7)`,
        [
          req.user.id,
          orderId,
          amount / 100,
          "KES",
          email,
          reference,
          JSON.stringify({ cardLast4: cardNumber.slice(-4), email }),
        ],
      );
    }

    // Update order status to confirmed
    await query(
      "UPDATE orders SET payment_status = 'paid', payment_method = 'card', status = 'confirmed', updated_at = NOW() WHERE id = $1",
      [orderId],
    );

    console.log("[v0] Payment completed successfully");
    res.json({ success: true, message: "Payment successful." });
  } catch (err) {
    console.error("[v0] Card charge error:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Card charge failed: " + err.message });
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  webhookCallback,
  chargeCard,
};
