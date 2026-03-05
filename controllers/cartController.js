const { query } = require('../config/database');

// Get cart items for logged-in user
const getCart = async (req, res) => {
  try {
    const result = await query(
      `SELECT ci.id, ci.quantity, ci.product_id,
              p.name, p.slug, p.price, p.compare_price, p.thumbnail, p.quantity as stock, p.currency,
              vp.store_name as vendor_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [req.user.id]
    );
    const items = result.rows.map(r => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      slug: r.slug,
      price: parseFloat(r.price),
      comparePrice: r.compare_price ? parseFloat(r.compare_price) : null,
      thumbnail: r.thumbnail,
      quantity: r.quantity,
      stock: r.stock,
      currency: r.currency,
      vendorName: r.vendor_name,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    res.json({ items, subtotal, count: items.length });
  } catch (err) {
    console.error('Get cart error:', err);
    res.status(500).json({ error: 'Failed to load cart.' });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required.' });
    
    // Check product exists and has stock
    const product = await query('SELECT id, quantity, price FROM products WHERE id = $1 AND is_active = true', [productId]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    if (product.rows[0].quantity < quantity) return res.status(400).json({ error: 'Insufficient stock.' });

    // Upsert cart item
    const result = await query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = NOW()
       RETURNING *`,
      [req.user.id, productId, quantity]
    );
    res.json({ item: result.rows[0], message: 'Added to cart.' });
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ error: 'Failed to add item to cart.' });
  }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1.' });

    const result = await query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cart item not found.' });
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error('Update cart error:', err);
    res.status(500).json({ error: 'Failed to update cart.' });
  }
};

// Remove cart item
const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ message: 'Item removed from cart.' });
  } catch (err) {
    console.error('Remove from cart error:', err);
    res.status(500).json({ error: 'Failed to remove item.' });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    await query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
};

// Sync local cart to DB (when user logs in)
const syncCart = async (req, res) => {
  try {
    const { items } = req.body; // [{productId, quantity}]
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items array is required.' });

    for (const item of items) {
      await query(
        `INSERT INTO cart_items (user_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, product_id)
         DO UPDATE SET quantity = GREATEST(cart_items.quantity, $3), updated_at = NOW()`,
        [req.user.id, item.productId, item.quantity]
      );
    }
    // Return updated cart
    const result = await query(
      `SELECT ci.id, ci.quantity, ci.product_id,
              p.name, p.slug, p.price, p.compare_price, p.thumbnail, p.quantity as stock, p.currency,
              vp.store_name as vendor_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
       WHERE ci.user_id = $1`,
      [req.user.id]
    );
    res.json({ items: result.rows, message: 'Cart synced.' });
  } catch (err) {
    console.error('Sync cart error:', err);
    res.status(500).json({ error: 'Failed to sync cart.' });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, clearCart, syncCart };
