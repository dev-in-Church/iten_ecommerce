const axios = require("axios");
const { query } = require("../config/database");

// M-Pesa Daraja API helpers
const getMpesaToken = async () => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa credentials not configured");
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64",
  );
  const baseUrl =
    process.env.MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  const response = await axios.get(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
    },
  );
  return response.data.access_token;
};

const getTimestamp = () => {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0")
  );
};

const formatPhoneNumber = (phone) => {
  // Remove spaces, dashes, and plus signs
  let formatted = phone.replace(/[\s\-\+]/g, "");
  // Convert 0xxx to 254xxx
  if (formatted.startsWith("0")) {
    formatted = "254" + formatted.substring(1);
  }
  // Remove leading + if present
  if (formatted.startsWith("+")) {
    formatted = formatted.substring(1);
  }
  return formatted;
};

// Initiate STK Push for order payment
const initiateOrderPayment = async (req, res) => {
  try {
    const { orderId, phone } = req.body;

    if (!orderId || !phone) {
      return res
        .status(400)
        .json({ error: "Order ID and phone number are required." });
    }

    // Verify order exists and belongs to user
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

    // Update order to pending_payment status
    await query(
      "UPDATE orders SET status = 'pending_payment', updated_at = NOW() WHERE id = $1",
      [orderId],
    );

    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const shortcode = process.env.MPESA_SHORTCODE || "174379";
    const passkey =
      process.env.MPESA_PASSKEY ||
      "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
      "base64",
    );

    const baseUrl =
      process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const formattedPhone = formatPhoneNumber(phone);
    const amount = Math.ceil(parseFloat(order.total));
    const callbackUrl =
      process.env.MPESA_CALLBACK_URL ||
      `${process.env.BACKEND_URL}/api/mpesa/callback`;

    console.log("[v0] Initiating STK Push:", {
      orderId,
      phone: formattedPhone,
      amount,
      shortcode,
    });

    const stkResponse = await axios.post(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${callbackUrl}/order`,
        AccountReference: order.order_number,
        TransactionDesc: `Payment for order ${order.order_number}`,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    console.log("[v0] STK Push Response:", stkResponse.data);

    if (stkResponse.data.ResponseCode !== "0") {
      throw new Error(
        stkResponse.data.ResponseDescription || "STK Push failed",
      );
    }

    // Save payment record
    await query(
      `INSERT INTO payments (user_id, order_id, payment_type, amount, currency, phone_number, mpesa_checkout_id, merchant_request_id, description, status)
       VALUES ($1, $2, 'order', $3, 'KES', $4, $5, $6, $7, 'pending')`,
      [
        req.user.id,
        orderId,
        order.total,
        formattedPhone,
        stkResponse.data.CheckoutRequestID,
        stkResponse.data.MerchantRequestID,
        `Order ${order.order_number}`,
      ],
    );

    res.json({
      success: true,
      message: "STK Push sent to your phone. Please enter your M-Pesa PIN.",
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      merchantRequestId: stkResponse.data.MerchantRequestID,
    });
  } catch (err) {
    console.error(
      "[v0] M-Pesa order payment error:",
      err.response?.data || err.message,
    );

    // Reset order status on failure
    if (req.body.orderId) {
      await query(
        "UPDATE orders SET status = 'pending', updated_at = NOW() WHERE id = $1",
        [req.body.orderId],
      );
    }

    res.status(500).json({
      error:
        err.response?.data?.errorMessage ||
        err.message ||
        "Payment initiation failed. Please try again.",
    });
  }
};

// M-Pesa callback for orders
const orderPaymentCallback = async (req, res) => {
  try {
    console.log(
      "[v0] Order callback received:",
      JSON.stringify(req.body, null, 2),
    );

    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      console.log("[v0] Invalid callback body");
      return res.json({ ResultCode: 0, ResultDesc: "Success" });
    }

    const { stkCallback } = Body;
    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stkCallback;

    console.log("[v0] Processing callback:", {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
    });

    if (ResultCode === 0) {
      // Payment successful
      const metadata = {};
      if (CallbackMetadata && CallbackMetadata.Item) {
        CallbackMetadata.Item.forEach((item) => {
          metadata[item.Name] = item.Value;
        });
      }

      console.log("[v0] Payment successful, metadata:", metadata);

      // Update payment record
      await query(
        `UPDATE payments SET 
          status = 'completed', 
          mpesa_receipt = $1, 
          metadata = $2, 
          updated_at = NOW()
         WHERE mpesa_checkout_id = $3`,
        [
          metadata.MpesaReceiptNumber || null,
          JSON.stringify(metadata),
          CheckoutRequestID,
        ],
      );

      // Get order ID from payment
      const payment = await query(
        "SELECT order_id FROM payments WHERE mpesa_checkout_id = $1",
        [CheckoutRequestID],
      );

      if (payment.rows.length > 0 && payment.rows[0].order_id) {
        // Update order to confirmed and paid
        await query(
          `UPDATE orders SET 
            payment_status = 'paid', 
            status = 'confirmed', 
            updated_at = NOW() 
           WHERE id = $1`,
          [payment.rows[0].order_id],
        );
        console.log(
          "[v0] Order updated to confirmed:",
          payment.rows[0].order_id,
        );
      }
    } else {
      // Payment failed
      console.log("[v0] Payment failed:", ResultDesc);

      await query(
        `UPDATE payments SET 
          status = 'failed', 
          metadata = $1, 
          updated_at = NOW() 
         WHERE mpesa_checkout_id = $2`,
        [JSON.stringify({ ResultCode, ResultDesc }), CheckoutRequestID],
      );

      // Get order ID and update status
      const payment = await query(
        "SELECT order_id FROM payments WHERE mpesa_checkout_id = $1",
        [CheckoutRequestID],
      );

      if (payment.rows.length > 0 && payment.rows[0].order_id) {
        await query(
          `UPDATE orders SET 
            status = 'payment_failed', 
            updated_at = NOW() 
           WHERE id = $1`,
          [payment.rows[0].order_id],
        );
        console.log(
          "[v0] Order marked as payment_failed:",
          payment.rows[0].order_id,
        );
      }
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (err) {
    console.error("[v0] Order callback error:", err);
    res.json({ ResultCode: 0, ResultDesc: "Success" });
  }
};

// Retry payment for failed order
const retryOrderPayment = async (req, res) => {
  try {
    const { orderId, phone } = req.body;

    if (!orderId || !phone) {
      return res
        .status(400)
        .json({ error: "Order ID and phone number are required." });
    }

    // Get order with payment_failed status
    const orderRes = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = 'payment_failed'`,
      [orderId, req.user.id],
    );

    if (orderRes.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No failed payment found for this order." });
    }

    // Use the same flow as initial payment
    req.body.orderId = orderId;
    req.body.phone = phone;
    return initiateOrderPayment(req, res);
  } catch (err) {
    console.error("[v0] Retry payment error:", err);
    res.status(500).json({ error: "Failed to retry payment." });
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    const result = await query(
      `SELECT p.status, p.mpesa_receipt, o.status as order_status, o.payment_status
       FROM payments p
       LEFT JOIN orders o ON p.order_id = o.id
       WHERE p.mpesa_checkout_id = $1`,
      [checkoutRequestId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment not found." });
    }

    const payment = result.rows[0];
    res.json({
      status: payment.status,
      receipt: payment.mpesa_receipt,
      orderStatus: payment.order_status,
      paymentStatus: payment.payment_status,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check payment status." });
  }
};

// Query STK Push status (for polling)
const queryPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;

    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const shortcode = process.env.MPESA_SHORTCODE || "174379";
    const passkey =
      process.env.MPESA_PASSKEY ||
      "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
      "base64",
    );

    const baseUrl =
      process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const response = await axios.post(
      `${baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    console.log("[v0] STK Query Response:", response.data);

    // ResultCode 0 = success, 1032 = cancelled, 1 = insufficient funds
    const resultCode = parseInt(response.data.ResultCode);
    let status = "pending";

    if (resultCode === 0) {
      status = "completed";
    } else if (resultCode === 1032) {
      status = "cancelled";
    } else if (resultCode === 1) {
      status = "insufficient_funds";
    } else if (resultCode !== undefined) {
      status = "failed";
    }

    res.json({
      status,
      resultCode,
      resultDesc: response.data.ResultDesc,
    });
  } catch (err) {
    console.error("[v0] STK Query error:", err.response?.data || err.message);
    // If query fails, check our database
    const result = await query(
      "SELECT status FROM payments WHERE mpesa_checkout_id = $1",
      [req.params.checkoutRequestId],
    );

    if (result.rows.length > 0) {
      res.json({ status: result.rows[0].status });
    } else {
      res.status(500).json({ error: "Failed to query payment status." });
    }
  }
};

module.exports = {
  initiateOrderPayment,
  orderPaymentCallback,
  retryOrderPayment,
  checkPaymentStatus,
  queryPaymentStatus,
};
