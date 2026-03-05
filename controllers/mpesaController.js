const axios = require('axios');
const { query } = require('../config/database');

// M-Pesa Daraja API helpers
const getMpesaToken = async () => {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const baseUrl = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const response = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return response.data.access_token;
};

const getTimestamp = () => {
  const now = new Date();
  return now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
};

// Initiate STK Push for order payment
const initiateOrderPayment = async (req, res) => {
  try {
    const { orderId, phoneNumber } = req.body;
    if (!orderId || !phoneNumber) {
      return res.status(400).json({ error: 'Order ID and phone number are required.' });
    }

    const orderRes = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.user.id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const order = orderRes.rows[0];

    if (order.payment_status === 'paid') return res.status(400).json({ error: 'Order already paid.' });

    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const baseUrl = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    const phone = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');

    const stkResponse = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(parseFloat(order.total)),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: `${process.env.MPESA_CALLBACK_URL}/order`,
      AccountReference: order.order_number,
      TransactionDesc: `Payment for order ${order.order_number}`,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Save payment record
    await query(
      `INSERT INTO payments (user_id, order_id, payment_type, amount, phone_number, mpesa_checkout_id, merchant_request_id, description)
       VALUES ($1, $2, 'order', $3, $4, $5, $6, $7)`,
      [req.user.id, orderId, order.total, phone, stkResponse.data.CheckoutRequestID, stkResponse.data.MerchantRequestID, `Order ${order.order_number}`]
    );

    res.json({
      message: 'STK Push sent to your phone. Please enter your M-Pesa PIN.',
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
    });
  } catch (err) {
    console.error('M-Pesa order payment error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initiation failed. Please try again.' });
  }
};

// Initiate STK Push for vendor subscription
const initiateSubscriptionPayment = async (req, res) => {
  try {
    const { planType, phoneNumber } = req.body;
    if (!planType || !phoneNumber) {
      return res.status(400).json({ error: 'Plan type and phone number required.' });
    }

    const amount = planType === 'yearly'
      ? parseFloat(process.env.YEARLY_SUBSCRIPTION_PRICE || 20000)
      : parseFloat(process.env.MONTHLY_SUBSCRIPTION_PRICE || 2000);

    // Get vendor profile
    const vpRes = await query('SELECT * FROM vendor_profiles WHERE user_id = $1', [req.user.id]);
    if (vpRes.rows.length === 0) return res.status(404).json({ error: 'Vendor profile not found.' });
    const vendorProfile = vpRes.rows[0];

    // Create subscription record
    const subRes = await query(
      `INSERT INTO vendor_subscriptions (vendor_id, plan_type, amount, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [vendorProfile.id, planType, amount]
    );
    const subscription = subRes.rows[0];

    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const baseUrl = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    const phone = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');

    const stkResponse = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: `${process.env.MPESA_CALLBACK_URL}/subscription`,
      AccountReference: `ITENGEAR-SUB-${subscription.id.substring(0, 8)}`,
      TransactionDesc: `${planType} subscription payment`,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Save payment record
    await query(
      `INSERT INTO payments (user_id, subscription_id, payment_type, amount, phone_number, mpesa_checkout_id, merchant_request_id, description)
       VALUES ($1, $2, 'subscription', $3, $4, $5, $6, $7)`,
      [req.user.id, subscription.id, amount, phone, stkResponse.data.CheckoutRequestID, stkResponse.data.MerchantRequestID, `${planType} vendor subscription`]
    );

    await query('UPDATE vendor_subscriptions SET transaction_id = $1 WHERE id = $2', [stkResponse.data.CheckoutRequestID, subscription.id]);

    res.json({
      message: 'STK Push sent. Please enter your M-Pesa PIN.',
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      subscriptionId: subscription.id,
    });
  } catch (err) {
    console.error('M-Pesa subscription error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Subscription payment failed. Please try again.' });
  }
};

// M-Pesa callback for orders
const orderPaymentCallback = async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;
    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    if (ResultCode === 0) {
      const metadata = {};
      CallbackMetadata.Item.forEach(item => { metadata[item.Name] = item.Value; });

      await query(
        `UPDATE payments SET status = 'completed', mpesa_receipt = $1, metadata = $2, updated_at = NOW()
         WHERE mpesa_checkout_id = $3`,
        [metadata.MpesaReceiptNumber, JSON.stringify(metadata), CheckoutRequestID]
      );

      const payment = await query('SELECT order_id FROM payments WHERE mpesa_checkout_id = $1', [CheckoutRequestID]);
      if (payment.rows.length > 0 && payment.rows[0].order_id) {
        await query(
          "UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = NOW() WHERE id = $1",
          [payment.rows[0].order_id]
        );
      }
    } else {
      await query(
        "UPDATE payments SET status = 'failed', metadata = $1, updated_at = NOW() WHERE mpesa_checkout_id = $2",
        [JSON.stringify({ ResultCode, ResultDesc }), CheckoutRequestID]
      );
    }
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (err) {
    console.error('Order callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  }
};

// M-Pesa callback for subscriptions
const subscriptionPaymentCallback = async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;
    const { CheckoutRequestID, ResultCode, CallbackMetadata } = stkCallback;

    if (ResultCode === 0) {
      const metadata = {};
      CallbackMetadata.Item.forEach(item => { metadata[item.Name] = item.Value; });

      await query(
        `UPDATE payments SET status = 'completed', mpesa_receipt = $1, metadata = $2, updated_at = NOW()
         WHERE mpesa_checkout_id = $3`,
        [metadata.MpesaReceiptNumber, JSON.stringify(metadata), CheckoutRequestID]
      );

      const payment = await query('SELECT subscription_id FROM payments WHERE mpesa_checkout_id = $1', [CheckoutRequestID]);
      if (payment.rows.length > 0 && payment.rows[0].subscription_id) {
        const sub = await query('SELECT * FROM vendor_subscriptions WHERE id = $1', [payment.rows[0].subscription_id]);
        if (sub.rows.length > 0) {
          const now = new Date();
          const expiresAt = sub.rows[0].plan_type === 'yearly'
            ? new Date(now.setFullYear(now.getFullYear() + 1))
            : new Date(now.setMonth(now.getMonth() + 1));

          await query(
            `UPDATE vendor_subscriptions SET status = 'active', mpesa_receipt = $1, starts_at = NOW(), expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [metadata.MpesaReceiptNumber, expiresAt, payment.rows[0].subscription_id]
          );

          // Auto-verify vendor
          await query('UPDATE vendor_profiles SET is_verified = true, verified_at = NOW() WHERE id = $1', [sub.rows[0].vendor_id]);
        }
      }
    } else {
      await query("UPDATE payments SET status = 'failed', updated_at = NOW() WHERE mpesa_checkout_id = $1", [CheckoutRequestID]);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (err) {
    console.error('Subscription callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const result = await query('SELECT status, mpesa_receipt FROM payments WHERE mpesa_checkout_id = $1', [checkoutRequestId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ status: result.rows[0].status, receipt: result.rows[0].mpesa_receipt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check payment status.' });
  }
};

module.exports = {
  initiateOrderPayment, initiateSubscriptionPayment,
  orderPaymentCallback, subscriptionPaymentCallback,
  checkPaymentStatus,
};
