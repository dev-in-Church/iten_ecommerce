const https = require("https");
const { query, getClient } = require("../config/database");

// Initialize Paystack payment
const initializePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    console.log("[v0] Initialize payment request:", {
      orderId,
      userId: req.user?.id,
    });

    if (!orderId) {
      console.log("[v0] Missing orderId in request body");
      return res.status(400).json({ error: "Order ID is required." });
    }

    // Get order
    const orderRes = await query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id],
    );

    if (orderRes.rows.length === 0) {
      console.log("[v0] Order not found:", { orderId, userId: req.user.id });
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderRes.rows[0];
    console.log("[v0] Found order:", {
      orderId,
      orderNumber: order.order_number,
      total: order.total,
    });

    if (order.payment_status === "paid") {
      console.log("[v0] Order already paid");
      return res.status(400).json({ error: "Order already paid." });
    }

    const amount = Math.round(parseFloat(order.total) * 100); // Convert to cents
    const email = req.user.email;
    const reference = `order-${orderId.slice(0, 8)}-${Date.now()}`;

    console.log("[v0] Paystack init data:", { email, amount, reference });

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

    console.log(
      "[v0] Sending to Paystack with key prefix:",
      process.env.PAYSTACK_SECRET_KEY?.substring(0, 10),
    );
    console.log("[v0] Request payload:", JSON.stringify(paystackData, null, 2));

    const paystackReq = https.request(options, (paystackRes) => {
      let data = "";
      paystackRes.on("data", (chunk) => {
        data += chunk;
      });

      paystackRes.on("end", () => {
        try {
          const body = JSON.parse(data);
          console.log(
            "[v0] Paystack raw response body:",
            JSON.stringify(body, null, 2),
          );
          console.log("[v0] Paystack response data fields:", {
            status: body.status,
            statusCode: paystackRes.statusCode,
            message: body.message,
            // Log the exact field names Paystack returns
            dataKeys: body.data ? Object.keys(body.data) : [],
            access_code: body.data?.access_code,
            authorization_url: body.data?.authorization_url,
            reference: body.data?.reference,
          });

          if (body.status) {
            console.log("[v0] Payment initialized successfully");

            // Use the exact field names from Paystack's response
            const accessCode = body.data.access_code;
            const authorizationUrl = body.data.authorization_url;
            const txReference = body.data.reference || reference;

            console.log("[v0] Extracted values:", {
              accessCode,
              authorizationUrl,
              txReference,
            });

            if (!accessCode) {
              console.error(
                "[v0] WARNING: access_code is missing from Paystack response!",
              );
            }

            // Store payment reference in database for verification later
            query(
              `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, status, reference, method)
               VALUES ($1, $2, 'order', $3, 'KES', 'pending', $4, 'paystack')`,
              [req.user.id, orderId, parseFloat(order.total), txReference],
            ).catch((err) =>
              console.error("[v0] Error storing payment record:", err),
            );

            res.json({
              status: true,
              data: {
                reference: txReference,
                authorizationUrl,
                accessCode,
              },
              message: "Authorization URL created",
            });
          } else {
            console.log("[v0] Paystack initialization failed:", body);
            res.status(400).json({
              error: body.message || "Failed to initialize Paystack payment.",
            });
          }
        } catch (err) {
          console.error("[v0] Paystack response parse error:", err.message);
          console.error("[v0] Raw response data:", data);
          res.status(500).json({ error: "Payment initialization failed." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("[v0] Paystack API error:", err.message);
      res.status(500).json({ error: "Payment initialization failed." });
    });

    paystackReq.write(JSON.stringify(paystackData));
    paystackReq.end();
  } catch (err) {
    console.error("[v0] Payment init error:", err.message);
    res
      .status(500)
      .json({ error: "Payment initialization failed: " + err.message });
  }
};

// Add this new function to your paystackController.js
const initializeInlinePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    console.log("[v0] Initialize inline payment request:", { orderId });

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

    const amount = Math.round(parseFloat(order.total) * 100);
    const email = req.user.email;
    const reference = `order-${orderId.slice(0, 8)}-${Date.now()}`;

    // Call Paystack API for inline/embedded payment
    const paystackData = {
      email,
      amount,
      metadata: {
        orderId,
        orderNumber: order.order_number,
        userId: req.user.id,
      },
      reference,
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
            // Return access_code for inline.js
            res.json({
              status: true,
              data: {
                reference: body.data.reference,
                accessCode: body.data.access_code,
              },
              message: "Inline payment initialized",
            });
          } else {
            res.status(400).json({
              error: body.message || "Failed to initialize Paystack payment.",
            });
          }
        } catch (err) {
          console.error("[v0] Paystack response parse error:", err.message);
          res.status(500).json({ error: "Payment initialization failed." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("[v0] Paystack API error:", err.message);
      res.status(500).json({ error: "Payment initialization failed." });
    });

    paystackReq.write(JSON.stringify(paystackData));
    paystackReq.end();
  } catch (err) {
    console.error("[v0] Payment init error:", err.message);
    res
      .status(500)
      .json({ error: "Payment initialization failed: " + err.message });
  }
};

// Verify Paystack payment
const verifyPayment = async (req, res) => {
  try {
    const { reference, orderId } = req.query;

    console.log("[v0] Verifying payment:", {
      reference,
      orderId,
      userId: req.user?.id,
    });

    if (!reference || !orderId) {
      console.log("[v0] Missing parameters");
      return res.status(400).json({
        status: false,
        error: "Payment reference and orderId are required.",
      });
    }

    if (!req.user || !req.user.id) {
      console.log("[v0] User not authenticated");
      return res
        .status(401)
        .json({ status: false, error: "User not authenticated." });
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

    console.log("[v0] Calling Paystack to verify:", { reference });

    const paystackReq = https.request(options, (paystackRes) => {
      let data = "";
      paystackRes.on("data", (chunk) => {
        data += chunk;
      });

      paystackRes.on("end", async () => {
        try {
          const body = JSON.parse(data);
          console.log("[v0] Paystack verification response:", {
            status: body.status,
            transactionStatus: body.data?.status,
          });

          if (body.status && body.data.status === "success") {
            const paystackRef = body.data.reference;

            // Update order payment status
            const client = await getClient();
            try {
              await client.query("BEGIN");

              // Get order
              const orderRes = await client.query(
                "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
                [orderId, req.user.id],
              );
              if (orderRes.rows.length === 0) {
                await client.query("ROLLBACK");
                console.log("[v0] Order not found:", {
                  orderId,
                  userId: req.user.id,
                });
                return res
                  .status(404)
                  .json({ status: false, error: "Order not found." });
              }

              const order = orderRes.rows[0];
              console.log("[v0] Found order:", {
                orderId,
                orderNumber: order.order_number,
                total: order.total,
              });

              // Update payment record
              await client.query(
                `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, status, method, reference, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (reference) DO UPDATE SET status = 'completed', method = 'card'`,
                [
                  req.user.id,
                  orderId,
                  "order",
                  order.total,
                  "KES",
                  "completed",
                  "card",
                  paystackRef,
                  "Paystack card payment",
                  JSON.stringify({
                    paystackId: body.data.id,
                    cardType: body.data.authorization?.card_type,
                  }),
                ],
              );

              console.log("[v0] Payment record updated");

              // Update order
              await client.query(
                "UPDATE orders SET payment_status = 'paid', payment_method = 'card', status = 'confirmed', updated_at = NOW() WHERE id = $1",
                [orderId],
              );

              console.log("[v0] Order updated to confirmed");

              await client.query("COMMIT");

              console.log(
                "[v0] Payment verified successfully, order confirmed",
              );
              res.json({
                status: true,
                success: true,
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
              console.error(
                "[v0] Database error during verification:",
                err.message,
              );
              throw err;
            } finally {
              client.release();
            }
          } else {
            console.log("[v0] Payment not successful from Paystack:", body);
            res.status(400).json({
              status: false,
              error: body.message || "Payment verification failed.",
            });
          }
        } catch (err) {
          console.error("[v0] Error parsing Paystack response:", err.message);
          res
            .status(500)
            .json({ status: false, error: "Payment verification error." });
        }
      });
    });

    paystackReq.on("error", (err) => {
      console.error("[v0] Paystack API error:", err.message);
      res.status(500).json({ status: false, error: "Paystack API error." });
    });

    paystackReq.end();
  } catch (err) {
    console.error("[v0] Verify payment error:", err.message);
    res.status(500).json({
      status: false,
      error: "Payment verification failed: " + err.message,
    });
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

module.exports = {
  initializePayment, // For redirect flow
  initializeInlinePayment, // For inline modal flow
  verifyPayment,
  webhookCallback,
};
