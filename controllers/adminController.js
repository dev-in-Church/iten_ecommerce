const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

// Admin Dashboard
const getDashboard = async (req, res) => {
  try {
    const [users, vendors, products, orders, revenue, recentOrders] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = 'customer') as customers, COUNT(*) FILTER (WHERE role = 'vendor') as vendors FROM users`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_verified = true) as verified FROM vendor_profiles`),
      query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM products'),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending, COUNT(*) FILTER (WHERE status = 'delivered') as delivered FROM orders`),
      query(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE payment_status = 'paid'`),
      query(`SELECT o.*, u.first_name, u.last_name, u.email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10`),
    ]);

    res.json({
      stats: {
        totalUsers: parseInt(users.rows[0].total),
        totalCustomers: parseInt(users.rows[0].customers),
        totalVendors: parseInt(users.rows[0].vendors),
        totalVendorProfiles: parseInt(vendors.rows[0].total),
        verifiedVendors: parseInt(vendors.rows[0].verified),
        totalProducts: parseInt(products.rows[0].total),
        activeProducts: parseInt(products.rows[0].active),
        totalOrders: parseInt(orders.rows[0].total),
        pendingOrders: parseInt(orders.rows[0].pending),
        deliveredOrders: parseInt(orders.rows[0].delivered),
        totalRevenue: parseFloat(revenue.rows[0].total),
      },
      recentOrders: recentOrders.rows,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard.' });
  }
};

// Users management
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (role) { params.push(role); where += ` AND role = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`; }
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(
      `SELECT id, email, first_name, last_name, phone, role, is_active, email_verified, created_at FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, -2);
    const count = await query(`SELECT COUNT(*) FROM users ${where}`, countParams);
    res.json({ users: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users.' });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user.' });
  }
};

// Vendor management
const getVendors = async (req, res) => {
  try {
    const { page = 1, limit = 20, verified } = req.query;
    const offset = (page - 1) * limit;
    let where = '';
    const params = [];
    if (verified === 'true') { where = 'WHERE vp.is_verified = true'; }
    else if (verified === 'false') { where = 'WHERE vp.is_verified = false'; }
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(
      `SELECT vp.*, u.email, u.first_name, u.last_name, u.phone, u.is_active
       FROM vendor_profiles vp JOIN users u ON vp.user_id = u.id ${where}
       ORDER BY vp.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json({ vendors: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load vendors.' });
  }
};

const verifyVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE vendor_profiles SET is_verified = true, verified_at = NOW(), verified_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found.' });
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify vendor.' });
  }
};

const unverifyVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE vendor_profiles SET is_verified = false, verified_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found.' });
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unverify vendor.' });
  }
};

// Orders management
const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { params.push(status); where += ` AND o.status = $${params.length}`; }
    if (paymentStatus) { params.push(paymentStatus); where += ` AND o.payment_status = $${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(
      `SELECT o.*, u.first_name, u.last_name, u.email
       FROM orders o JOIN users u ON o.user_id = u.id ${where}
       ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, -2);
    const count = await query(`SELECT COUNT(*) FROM orders o ${where}`, countParams);
    res.json({ orders: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load orders.' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;
    const setClauses = [];
    const values = [];
    if (status) { values.push(status); setClauses.push(`status = $${values.length}`); }
    if (paymentStatus) { values.push(paymentStatus); setClauses.push(`payment_status = $${values.length}`); }
    setClauses.push('updated_at = NOW()');
    values.push(id);
    const result = await query(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order.' });
  }
};

// Payments management
const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (type) { params.push(type); where += ` AND p.payment_type = $${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(
      `SELECT p.*, u.first_name, u.last_name, u.email
       FROM payments p JOIN users u ON p.user_id = u.id ${where}
       ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ payments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments.' });
  }
};

// Products management
const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT p.*, c.name as category_name, vp.store_name, u.email as vendor_email
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
       LEFT JOIN users u ON vp.user_id = u.id
       ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    const count = await query('SELECT COUNT(*) FROM products');
    res.json({ products: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('UPDATE products SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle product.' });
  }
};

const toggleProductFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('UPDATE products SET is_featured = NOT is_featured, updated_at = NOW() WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle featured.' });
  }
};

// Subscriptions management
const getAllSubscriptions = async (req, res) => {
  try {
    const result = await query(
      `SELECT vs.*, vp.store_name, u.email, u.first_name, u.last_name
       FROM vendor_subscriptions vs
       JOIN vendor_profiles vp ON vs.vendor_id = vp.id
       JOIN users u ON vp.user_id = u.id
       ORDER BY vs.created_at DESC`
    );
    res.json({ subscriptions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscriptions.' });
  }
};

module.exports = {
  getDashboard, getUsers, toggleUserStatus,
  getVendors, verifyVendor, unverifyVendor,
  getAllOrders, updateOrderStatus,
  getAllPayments, getAllProducts, toggleProductStatus, toggleProductFeatured,
  getAllSubscriptions,
};
