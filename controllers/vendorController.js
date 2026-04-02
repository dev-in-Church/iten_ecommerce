const { query } = require("../config/database");

// Platform commission rate (percentage taken from each sale)
const PLATFORM_COMMISSION_RATE = 10; // 10% commission on sales

// Get vendor dashboard stats
const getDashboard = async (req, res) => {
  try {
    console.log("[v0] getDashboard: userId =", req.user.id);

    const vp = await query("SELECT * FROM vendor_profiles WHERE user_id = $1", [
      req.user.id,
    ]);
    console.log("[v0] getDashboard: vendor profile rows =", vp.rows.length);

    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor profile not found." });
    const vendorId = vp.rows[0].id;
    const commissionRate =
      vp.rows[0].commission_rate || PLATFORM_COMMISSION_RATE;

    console.log(
      "[v0] getDashboard: vendorId =",
      vendorId,
      "commissionRate =",
      commissionRate,
    );

    const [products, orders, revenue] = await Promise.all([
      query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM products WHERE vendor_id = $1",
        [vendorId],
      ),
      query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending, COUNT(*) FILTER (WHERE status = 'delivered') as delivered
             FROM order_items WHERE vendor_id = $1`,
        [vendorId],
      ),
      query(
        `SELECT COALESCE(SUM(total_price), 0) as total_revenue FROM order_items
             WHERE vendor_id = $1 AND order_id IN (SELECT id FROM orders WHERE payment_status = 'paid')`,
        [vendorId],
      ),
    ]);

    console.log(
      "[v0] getDashboard: products =",
      products.rows[0],
      "orders =",
      orders.rows[0],
      "revenue =",
      revenue.rows[0],
    );

    const totalRevenue = parseFloat(revenue.rows[0].total_revenue);
    const platformCommission = totalRevenue * (commissionRate / 100);
    const vendorEarnings = totalRevenue - platformCommission;

    res.json({
      vendor: vp.rows[0],
      stats: {
        totalProducts: parseInt(products.rows[0].total),
        activeProducts: parseInt(products.rows[0].active),
        totalOrders: parseInt(orders.rows[0].total),
        pendingOrders: parseInt(orders.rows[0].pending),
        deliveredOrders: parseInt(orders.rows[0].delivered),
        totalRevenue: totalRevenue,
        platformCommission: platformCommission,
        vendorEarnings: vendorEarnings,
        commissionRate: commissionRate,
      },
    });
  } catch (err) {
    console.error("[v0] Vendor dashboard error:", err.message);
    res.status(500).json({ error: "Failed to load dashboard." });
  }
};

// Vendor products CRUD
const getVendorProducts = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor profile not found." });
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.vendor_id = $1 ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [vp.rows[0].id, parseInt(limit), parseInt(offset)],
    );
    const count = await query(
      "SELECT COUNT(*) FROM products WHERE vendor_id = $1",
      [vp.rows[0].id],
    );
    res.json({ products: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load products." });
  }
};

const createProduct = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id, is_verified FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor profile not found." });

    const {
      name,
      description,
      shortDescription,
      price,
      comparePrice,
      categoryId,
      quantity,
      brand,
      images,
      thumbnail,
      tags,
      specifications,
      sku,
    } = req.body;
    if (!name || !price)
      return res.status(400).json({ error: "Name and price are required." });
    if (!thumbnail)
      return res.status(400).json({ error: "Product image is required." });

    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Date.now().toString(36);

    const result = await query(
      `INSERT INTO products (vendor_id, category_id, name, slug, description, short_description, price, compare_price, quantity, brand, images, thumbnail, tags, specifications, sku)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        vp.rows[0].id,
        categoryId || null,
        name,
        slug,
        description,
        shortDescription,
        price,
        comparePrice || null,
        quantity || 0,
        brand || null,
        images || "{}",
        thumbnail,
        tags || "{}",
        specifications ? JSON.stringify(specifications) : "{}",
        sku || null,
      ],
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error("[v0] Create product error:", err);
    res.status(500).json({ error: "Failed to create product." });
  }
};

const updateProduct = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor not found." });
    const { id } = req.params;
    const fields = req.body;

    const setClauses = [];
    const values = [];
    let i = 1;
    const allowed = [
      "name",
      "description",
      "short_description",
      "price",
      "compare_price",
      "category_id",
      "quantity",
      "brand",
      "images",
      "thumbnail",
      "tags",
      "is_active",
      "is_featured",
      "sku",
    ];
    for (const [key, value] of Object.entries(fields)) {
      const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (allowed.includes(dbKey)) {
        setClauses.push(`${dbKey} = $${i}`);
        values.push(value);
        i++;
      }
    }
    if (setClauses.length === 0)
      return res.status(400).json({ error: "No valid fields to update." });
    setClauses.push(`updated_at = NOW()`);
    values.push(id, vp.rows[0].id);

    const result = await query(
      `UPDATE products SET ${setClauses.join(", ")} WHERE id = $${i} AND vendor_id = $${i + 1} RETURNING *`,
      values,
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found." });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product." });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor not found." });
    const { id } = req.params;
    await query(
      "UPDATE products SET is_active = false WHERE id = $1 AND vendor_id = $2",
      [id, vp.rows[0].id],
    );
    res.json({ message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product." });
  }
};

// Get vendor orders
const getVendorOrders = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor not found." });
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE oi.vendor_id = $1";
    const params = [vp.rows[0].id];
    if (status) {
      params.push(status);
      where += ` AND oi.status = $${params.length}`;
    }
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(
      `SELECT oi.*, o.order_number, o.payment_status, o.created_at as order_date,
              u.first_name as customer_first, u.last_name as customer_last, u.email as customer_email
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN users u ON o.user_id = u.id
       ${where}
       ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ orders: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load orders." });
  }
};

// Update order item status
const updateOrderItemStatus = async (req, res) => {
  try {
    const vp = await query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1",
      [req.user.id],
    );
    const { id } = req.params;
    const { status } = req.body;
    const result = await query(
      "UPDATE order_items SET status = $1 WHERE id = $2 AND vendor_id = $3 RETURNING *",
      [status, id, vp.rows[0].id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Order item not found." });
    res.json({ orderItem: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order status." });
  }
};

// Get vendor earnings and commission breakdown
const getEarnings = async (req, res) => {
  try {
    const vp = await query("SELECT * FROM vendor_profiles WHERE user_id = $1", [
      req.user.id,
    ]);
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor not found." });

    const vendorId = vp.rows[0].id;
    const commissionRate =
      vp.rows[0].commission_rate || PLATFORM_COMMISSION_RATE;

    // Get monthly earnings breakdown
    const monthly = await query(
      `SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        SUM(oi.total_price) as revenue,
        COUNT(DISTINCT o.id) as orders
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.vendor_id = $1 AND o.payment_status = 'paid'
       GROUP BY DATE_TRUNC('month', o.created_at)
       ORDER BY month DESC
       LIMIT 12`,
      [vendorId],
    );

    const earnings = monthly.rows.map((row) => ({
      month: row.month,
      revenue: parseFloat(row.revenue),
      commission: parseFloat(row.revenue) * (commissionRate / 100),
      earnings: parseFloat(row.revenue) * (1 - commissionRate / 100),
      orders: parseInt(row.orders),
    }));

    res.json({
      commissionRate,
      earnings,
      totalRevenue: earnings.reduce((sum, e) => sum + e.revenue, 0),
      totalCommission: earnings.reduce((sum, e) => sum + e.commission, 0),
      totalEarnings: earnings.reduce((sum, e) => sum + e.earnings, 0),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load earnings." });
  }
};

// Update vendor profile
const updateVendorProfile = async (req, res) => {
  try {
    const { storeName, storeDescription, address, city } = req.body;
    const result = await query(
      `UPDATE vendor_profiles SET store_name = COALESCE($1, store_name), store_description = COALESCE($2, store_description),
       address = COALESCE($3, address), city = COALESCE($4, city), updated_at = NOW()
       WHERE user_id = $5 RETURNING *`,
      [storeName, storeDescription, address, city, req.user.id],
    );
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile." });
  }
};

// Request verification (for badge display, not required for selling)
const requestVerification = async (req, res) => {
  try {
    const vp = await query("SELECT * FROM vendor_profiles WHERE user_id = $1", [
      req.user.id,
    ]);
    if (vp.rows.length === 0)
      return res.status(404).json({ error: "Vendor not found." });

    // Check if they have completed orders (proof of legitimate business)
    const orders = await query(
      `SELECT COUNT(*) FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.vendor_id = $1 AND o.payment_status = 'paid'`,
      [vp.rows[0].id],
    );

    if (parseInt(orders.rows[0].count) < 5) {
      return res.status(400).json({
        error: "You need at least 5 completed orders to request verification.",
        currentOrders: parseInt(orders.rows[0].count),
      });
    }

    // Auto-verify if they meet criteria
    await query(
      `UPDATE vendor_profiles SET is_verified = true, verified_at = NOW() WHERE id = $1`,
      [vp.rows[0].id],
    );

    res.json({ message: "Your store has been verified!", verified: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to request verification." });
  }
};

module.exports = {
  getDashboard,
  getVendorProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getVendorOrders,
  updateOrderItemStatus,
  getEarnings,
  updateVendorProfile,
  requestVerification,
};
