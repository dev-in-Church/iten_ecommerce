const { query, getClient } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// Create order (starts with 'pending' status, payment is separate)
const createOrder = async (req, res) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const {
      shippingAddress,
      shippingPhone,
      paymentMethod,
      deliveryAreaId,
      notes,
    } = req.body;

    // Get cart items
    const cartRes = await client.query(
      `SELECT ci.*, p.name, p.price, p.thumbnail, p.vendor_id, p.quantity as stock_qty, vp.id as vendor_profile_id 
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN vendor_profiles vp ON p.vendor_id = vp.id
       WHERE ci.user_id = $1`,
      [req.user.id],
    );

    if (cartRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Your cart is empty." });
    }

    // Validate stock and build order items
    const orderItems = [];
    let subtotal = 0;

    for (const item of cartRes.rows) {
      if (item.stock_qty < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Insufficient stock for ${item.name}. Only ${item.stock_qty} available.`,
        });
      }

      const totalPrice = parseFloat(item.price) * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        productId: item.product_id,
        vendorId: item.vendor_profile_id,
        productName: item.name,
        productImage: item.thumbnail,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price),
        totalPrice,
      });
    }

    // Calculate totals
    const shippingFee = subtotal > 5000 ? 0 : 300;
    const tax = 0;
    const total = subtotal + shippingFee + tax;
    const orderNumber = `IG-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}`;

    // Determine initial status based on payment method
    // COD orders start as 'confirmed', others start as 'pending' (awaiting payment)
    const initialStatus = paymentMethod === "cod" ? "confirmed" : "pending";
    const initialPaymentStatus = paymentMethod === "cod" ? "unpaid" : "unpaid";

    // Create order
    const orderRes = await client.query(
      `INSERT INTO orders (order_number, user_id, subtotal, shipping_fee, tax, total, status, payment_status, payment_method, shipping_method, shipping_address, shipping_phone, delivery_area_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        orderNumber,
        req.user.id,
        subtotal,
        shippingFee,
        tax,
        total,
        initialStatus,
        initialPaymentStatus,
        paymentMethod || "mpesa",
        "standard",
        shippingAddress,
        shippingPhone,
        deliveryAreaId,
        notes || null,
      ],
    );
    const order = orderRes.rows[0];

    // Create order items and reduce stock
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, vendor_id, product_name, product_image, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          item.productId,
          item.vendorId,
          item.productName,
          item.productImage,
          item.quantity,
          item.unitPrice,
          item.totalPrice,
        ],
      );

      // Reduce stock
      await client.query(
        "UPDATE products SET quantity = quantity - $1, total_sold = total_sold + $1 WHERE id = $2",
        [item.quantity, item.productId],
      );
    }

    // Clear user cart
    await client.query("DELETE FROM cart_items WHERE user_id = $1", [
      req.user.id,
    ]);

    await client.query("COMMIT");

    res.status(201).json({
      order: { ...order, items: orderItems },
      message:
        paymentMethod === "cod"
          ? "Order placed successfully. Pay on delivery."
          : "Order created. Please complete payment.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message || "Failed to create order." });
  } finally {
    client.release();
  }
};

// Get user orders
const getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE o.user_id = $1";
    const params = [req.user.id];

    if (status) {
      params.push(status);
      where += ` AND o.status = $${params.length}`;
    }

    const countParams = [...params];
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT o.* FROM orders o ${where} ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Get items for each order
    for (const order of result.rows) {
      const items = await query(
        "SELECT * FROM order_items WHERE order_id = $1",
        [order.id],
      );
      order.items = items.rows;
    }

    const countRes = await query(
      `SELECT COUNT(*) FROM orders o ${where}`,
      countParams,
    );
    res.json({
      orders: result.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
    });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "Failed to load orders." });
  }
};

// Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [id, req.user.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Order not found." });

    const items = await query(
      `SELECT oi.*, vp.store_name as vendor_name FROM order_items oi
       LEFT JOIN vendor_profiles vp ON oi.vendor_id = vp.id
       WHERE oi.order_id = $1`,
      [id],
    );
    res.json({ order: { ...result.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: "Failed to load order." });
  }
};

// Get order for payment (includes payment-failed orders for retry)
const getOrderForPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'payment_failed')`,
      [id, req.user.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Order not found or already paid." });
    }

    res.json({ order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to load order." });
  }
};

// Cancel order (only pending orders)
const cancelOrder = async (req, res) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const result = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'pending_payment', 'payment_failed')`,
      [id, req.user.id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Order cannot be cancelled." });
    }

    // Restore stock
    const items = await client.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [id],
    );
    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET quantity = quantity + $1, total_sold = total_sold - $1 WHERE id = $2",
        [item.quantity, item.product_id],
      );
    }

    // Update order status
    const updated = await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id],
    );

    await client.query("COMMIT");
    res.json({ order: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to cancel order." });
  } finally {
    client.release();
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  getOrderForPayment,
  cancelOrder,
};
