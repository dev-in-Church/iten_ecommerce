const { query, getClient } = require("../config/database");
const {
  sendVendorOrderNotification,
  sendAdminOrderNotification,
  sendCustomerOrderConfirmation,
} = require("../services/emailService");

// Create notifications for order (vendor + admin + customer)
const createNotifications = async (
  orderId,
  orderNumber,
  userId,
  vendorIds,
  totalAmount,
) => {
  try {
    const notifications = [];

    // Get customer email and details
    const customerRes = await query(
      "SELECT email, first_name, last_name FROM users WHERE id = $1",
      [userId],
    );
    const customerEmail = customerRes.rows[0]?.email;
    const customerName = customerRes.rows[0]
      ? `${customerRes.rows[0].first_name} ${customerRes.rows[0].last_name}`.trim()
      : "Customer";

    // Get order details
    const orderRes = await query(
      `SELECT o.*, u.email as customer_email, CONCAT(u.first_name, ' ', u.last_name) as customer_name 
       FROM orders o 
       JOIN users u ON o.user_id = u.id 
       WHERE o.id = $1`,
      [orderId],
    );
    const order = orderRes.rows[0];

    // Get order items with vendor and product details
    const itemsRes = await query(
      `SELECT oi.*, p.name as product_name, vp.id as vendor_profile_id, u.email as vendor_email, CONCAT(u.first_name, ' ', u.last_name) as vendor_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN vendor_profiles vp ON p.vendor_id = vp.id
       JOIN users u ON vp.user_id = u.id
       WHERE oi.order_id = $1`,
      [orderId],
    );

    // Group items by vendor
    const itemsByVendor = {};
    for (const item of itemsRes.rows) {
      if (!itemsByVendor[item.vendor_profile_id]) {
        itemsByVendor[item.vendor_profile_id] = {
          vendorId: item.vendor_profile_id,
          vendorEmail: item.vendor_email,
          vendorName: item.vendor_name,
          items: [],
        };
      }
      itemsByVendor[item.vendor_profile_id].items.push({
        productName: item.product_name,
        quantity: item.quantity,
        totalPrice: item.total_price,
      });
    }

    // Create in-app notifications and send emails to vendors
    for (const vendorId of vendorIds) {
      const vendorRes = await query(
        "SELECT user_id FROM vendor_profiles WHERE id = $1",
        [vendorId],
      );
      if (vendorRes.rows.length > 0) {
        const vendorUserId = vendorRes.rows[0].user_id;
        notifications.push({
          user_id: vendorUserId,
          type: "order",
          title: "New Order",
          message: `Order #${orderNumber} contains your products. Check details now.`,
          link: `/vendor/dashboard/orders/${orderId}`,
          is_read: false,
        });

        // Send vendor email
        const vendorData = itemsByVendor[vendorId];
        if (vendorData) {
          sendVendorOrderNotification({
            email: vendorData.vendorEmail,
            vendorName: vendorData.vendorName,
            orderNumber,
            customerName,
            shippingAddress: order.shipping_address,
            shippingPhone: order.shipping_phone,
            items: vendorData.items,
          }).catch((err) => console.error("[v0] Email send error:", err));
        }
      }
    }

    // Notify admin
    const adminRes = await query(
      "SELECT id, email FROM users WHERE role = 'admin' LIMIT 1",
    );
    if (adminRes.rows.length > 0) {
      notifications.push({
        user_id: adminRes.rows[0].id,
        type: "order",
        title: "New Order Received",
        message: `Order #${orderNumber} for KES ${totalAmount.toLocaleString()} received. Review for printing.`,
        link: `/admin/dashboard/orders?search=${orderNumber}`,
        is_read: false,
      });

      // Send admin email
      sendAdminOrderNotification(adminRes.rows[0].email, {
        orderNumber,
        total: totalAmount,
        paymentStatus: order.payment_status,
        items: itemsRes.rows.map((item) => ({
          productName: item.product_name,
          quantity: item.quantity,
          vendorName: item.vendor_name,
        })),
        customerName,
        customerEmail: order.customer_email,
        shippingPhone: order.shipping_phone,
        shippingAddress: order.shipping_address,
      }).catch((err) => console.error("[v0] Email send error:", err));
    }

    // Notify customer
    notifications.push({
      user_id: userId,
      type: "order",
      title: "Order Confirmed",
      message: `Your order #${orderNumber} has been confirmed. Track its progress.`,
      link: `/store/orders/${orderId}`,
      is_read: false,
    });

    // Send customer confirmation email
    sendCustomerOrderConfirmation({
      email: customerEmail,
      customerName,
      orderNumber,
      total: totalAmount,
      paymentMethod: order.payment_method,
      shippingAddress: order.shipping_address,
      shippingPhone: order.shipping_phone,
      items: itemsRes.rows.map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        totalPrice: item.total_price,
      })),
    }).catch((err) => console.error("[v0] Email send error:", err));

    // Insert all in-app notifications
    for (const notif of notifications) {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          notif.user_id,
          notif.type,
          notif.title,
          notif.message,
          notif.link,
          notif.is_read,
        ],
      );
    }

    console.log(
      `[v0] Created ${notifications.length} notifications and sent emails for order ${orderNumber}`,
    );
  } catch (err) {
    console.error("[v0] Error creating notifications:", err.message);
  }
};

// Get notifications for user
const getNotifications = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error("[v0] Get notifications error:", err);
    res.status(500).json({ error: "Failed to load notifications." });
  }
};

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id],
    );
    res.json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("[v0] Get unread count error:", err);
    res.status(500).json({ error: "Failed to load unread count." });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, req.user.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[v0] Mark as read error:", err);
    res.status(500).json({ error: "Failed to update notification." });
  }
};

// Mark all as read
const markAllAsRead = async (req, res) => {
  try {
    await query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("[v0] Mark all as read error:", err);
    res.status(500).json({ error: "Failed to update notifications." });
  }
};

module.exports = {
  createNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
