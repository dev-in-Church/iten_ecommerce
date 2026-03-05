const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Create order
const createOrder = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { addressId, items, shippingMethod, notes } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must have at least one item.' });
    }

    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const productRes = await client.query(
        `SELECT p.*, vp.id as vendor_profile_id FROM products p
         JOIN vendor_profiles vp ON p.vendor_id = vp.id
         WHERE p.id = $1 AND p.is_active = true`,
        [item.productId]
      );
      if (productRes.rows.length === 0) throw new Error(`Product ${item.productId} not found.`);
      const product = productRes.rows[0];
      if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}.`);
      
      const totalPrice = parseFloat(product.price) * item.quantity;
      subtotal += totalPrice;
      orderItems.push({
        productId: product.id,
        vendorId: product.vendor_profile_id,
        productName: product.name,
        productImage: product.thumbnail,
        quantity: item.quantity,
        unitPrice: parseFloat(product.price),
        totalPrice,
      });
      
      // Reduce stock
      await client.query('UPDATE products SET quantity = quantity - $1, total_sold = total_sold + $1 WHERE id = $2', [item.quantity, product.id]);
    }

    const shippingFee = subtotal > 5000 ? 0 : 300;
    const tax = 0;
    const total = subtotal + shippingFee + tax;
    const orderNumber = `IG-${Date.now().toString(36).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}`;

    const orderRes = await client.query(
      `INSERT INTO orders (order_number, user_id, address_id, subtotal, shipping_fee, tax, total, shipping_method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [orderNumber, req.user.id, addressId || null, subtotal, shippingFee, tax, total, shippingMethod || 'standard', notes || null]
    );
    const order = orderRes.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, vendor_id, product_name, product_image, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, item.productId, item.vendorId, item.productName, item.productImage, item.quantity, item.unitPrice, item.totalPrice]
      );
    }

    // Clear user cart
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

    await client.query('COMMIT');
    res.status(201).json({ order: { ...order, items: orderItems } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order.' });
  } finally {
    client.release();
  }
};

// Get user orders
const getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE o.user_id = $1';
    const params = [req.user.id];
    if (status) {
      params.push(status);
      where += ` AND o.status = $${params.length}`;
    }
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(
      `SELECT o.* FROM orders o ${where} ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    // Get items for each order
    for (const order of result.rows) {
      const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      order.items = items.rows;
    }
    const countRes = await query(`SELECT COUNT(*) FROM orders o ${where}`, params.slice(0, status ? 2 : 1));
    res.json({ orders: result.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page) });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
};

// Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    const items = await query(
      `SELECT oi.*, vp.store_name as vendor_name FROM order_items oi
       LEFT JOIN vendor_profiles vp ON oi.vendor_id = vp.id
       WHERE oi.order_id = $1`,
      [id]
    );
    res.json({ order: { ...result.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load order.' });
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *",
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Order cannot be cancelled.' });
    res.json({ order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
};

module.exports = { createOrder, getMyOrders, getOrder, cancelOrder };
