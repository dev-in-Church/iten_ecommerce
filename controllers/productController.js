const { query } = require('../config/database');

// Mock products for fallback
const MOCK_PRODUCTS = [
  { id: 'mock-1', name: 'Nike Air Zoom Pegasus 40', slug: 'nike-air-zoom-pegasus-40', price: 12500, compare_price: 15000, currency: 'KES', thumbnail: '/images/products/running-shoe-1.jpg', images: [], category_name: 'Running', vendor_name: 'Nike Store', rating: 4.5, total_reviews: 128, total_sold: 340, is_featured: true, quantity: 50, short_description: 'Premium running shoes for everyday athletes' },
  { id: 'mock-2', name: 'Adidas Predator Edge', slug: 'adidas-predator-edge', price: 18000, compare_price: 22000, currency: 'KES', thumbnail: '/images/products/football-boot-1.jpg', images: [], category_name: 'Football', vendor_name: 'Adidas Official', rating: 4.7, total_reviews: 95, total_sold: 215, is_featured: true, quantity: 30, short_description: 'Professional football boots with advanced grip' },
  { id: 'mock-3', name: 'Under Armour Curry 11', slug: 'under-armour-curry-11', price: 22000, compare_price: 25000, currency: 'KES', thumbnail: '/images/products/basketball-shoe-1.jpg', images: [], category_name: 'Basketball', vendor_name: 'UA Sports', rating: 4.8, total_reviews: 72, total_sold: 156, is_featured: true, quantity: 25, short_description: 'Signature basketball shoe with responsive cushioning' },
  { id: 'mock-4', name: 'Wilson Pro Staff Tennis Racket', slug: 'wilson-pro-staff-tennis', price: 35000, compare_price: 40000, currency: 'KES', thumbnail: '/images/products/tennis-racket-1.jpg', images: [], category_name: 'Tennis', vendor_name: 'Wilson Sports', rating: 4.6, total_reviews: 45, total_sold: 89, is_featured: true, quantity: 15, short_description: 'Professional-grade tennis racket' },
  { id: 'mock-5', name: 'Speedo FastSkin Goggles', slug: 'speedo-fastskin-goggles', price: 4500, compare_price: 5500, currency: 'KES', thumbnail: '/images/products/swim-goggles-1.jpg', images: [], category_name: 'Swimming', vendor_name: 'Speedo Kenya', rating: 4.3, total_reviews: 63, total_sold: 420, is_featured: false, quantity: 100, short_description: 'Competition swimming goggles' },
  { id: 'mock-6', name: 'PowerBlock Adjustable Dumbbells', slug: 'powerblock-adjustable-dumbbells', price: 28000, compare_price: 32000, currency: 'KES', thumbnail: '/images/products/dumbbells-1.jpg', images: [], category_name: 'Gym & Fitness', vendor_name: 'FitGear KE', rating: 4.9, total_reviews: 38, total_sold: 95, is_featured: true, quantity: 20, short_description: 'Space-saving adjustable dumbbells 5-50lbs' },
  { id: 'mock-7', name: 'Giant Defy Road Bike', slug: 'giant-defy-road-bike', price: 85000, compare_price: 95000, currency: 'KES', thumbnail: '/images/products/road-bike-1.jpg', images: [], category_name: 'Cycling', vendor_name: 'Bike Hub KE', rating: 4.7, total_reviews: 22, total_sold: 34, is_featured: true, quantity: 8, short_description: 'Endurance road bike for long-distance riding' },
  { id: 'mock-8', name: 'Nike Zoom Rival Sprint Spikes', slug: 'nike-zoom-rival-sprint', price: 9500, compare_price: 11000, currency: 'KES', thumbnail: '/images/products/sprint-spikes-1.jpg', images: [], category_name: 'Athletics', vendor_name: 'Nike Store', rating: 4.4, total_reviews: 56, total_sold: 180, is_featured: false, quantity: 40, short_description: 'Track spikes for sprint events' },
  { id: 'mock-9', name: 'Puma Future Ultimate FG', slug: 'puma-future-ultimate', price: 16000, compare_price: 19000, currency: 'KES', thumbnail: '/images/products/football-boot-2.jpg', images: [], category_name: 'Football', vendor_name: 'Puma Sports', rating: 4.5, total_reviews: 67, total_sold: 198, is_featured: false, quantity: 35, short_description: 'Agility football boots with dynamic fit' },
  { id: 'mock-10', name: 'Reebok Nano X3 Training', slug: 'reebok-nano-x3', price: 14000, compare_price: 16500, currency: 'KES', thumbnail: '/images/products/training-shoe-1.jpg', images: [], category_name: 'Gym & Fitness', vendor_name: 'FitGear KE', rating: 4.6, total_reviews: 84, total_sold: 267, is_featured: true, quantity: 45, short_description: 'Versatile cross-training shoe' },
  { id: 'mock-11', name: 'Asics Gel-Kayano 30', slug: 'asics-gel-kayano-30', price: 19500, compare_price: 23000, currency: 'KES', thumbnail: '/images/products/running-shoe-2.jpg', images: [], category_name: 'Running', vendor_name: 'Run Kenya', rating: 4.8, total_reviews: 112, total_sold: 305, is_featured: true, quantity: 28, short_description: 'Maximum support running shoe' },
  { id: 'mock-12', name: 'Yoga Mat Premium 6mm', slug: 'yoga-mat-premium-6mm', price: 3500, compare_price: 4500, currency: 'KES', thumbnail: '/images/products/yoga-mat-1.jpg', images: [], category_name: 'Gym & Fitness', vendor_name: 'FitGear KE', rating: 4.2, total_reviews: 156, total_sold: 890, is_featured: false, quantity: 200, short_description: 'Non-slip premium yoga mat' },
];

// Get all products with filters
const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, sort, minPrice, maxPrice, featured } = req.query;
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE p.is_active = true';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      whereClause += ` AND c.slug = $${paramCount}`;
      params.push(category);
    }
    if (search) {
      paramCount++;
      whereClause += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.brand ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    if (minPrice) {
      paramCount++;
      whereClause += ` AND p.price >= $${paramCount}`;
      params.push(minPrice);
    }
    if (maxPrice) {
      paramCount++;
      whereClause += ` AND p.price <= $${paramCount}`;
      params.push(maxPrice);
    }
    if (featured === 'true') {
      whereClause += ' AND p.is_featured = true';
    }

    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort === 'price_asc') orderClause = 'ORDER BY p.price ASC';
    else if (sort === 'price_desc') orderClause = 'ORDER BY p.price DESC';
    else if (sort === 'popular') orderClause = 'ORDER BY p.total_sold DESC';
    else if (sort === 'rating') orderClause = 'ORDER BY p.rating DESC';
    else if (sort === 'newest') orderClause = 'ORDER BY p.created_at DESC';

    paramCount++;
    const limitParam = paramCount;
    params.push(parseInt(limit));
    paramCount++;
    const offsetParam = paramCount;
    params.push(parseInt(offset));

    const sql = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, vp.store_name as vendor_name, vp.is_verified as vendor_verified
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
      ${whereClause}
      ${orderClause}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const countSql = `
      SELECT COUNT(*) as total FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;

    const [products, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2))
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      products: products.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      source: 'database'
    });
  } catch (err) {
    console.error('Get products error (falling back to mock):', err.message);
    // Fallback to mock products
    const { page = 1, limit = 20, category, search, featured } = req.query;
    let filtered = [...MOCK_PRODUCTS];
    if (category) filtered = filtered.filter(p => p.category_name.toLowerCase().replace(/[^a-z]/g, '-') === category);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (featured === 'true') filtered = filtered.filter(p => p.is_featured);
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + parseInt(limit));
    res.json({ products: paged, pagination: { page: parseInt(page), limit: parseInt(limit), total: filtered.length, pages: Math.ceil(filtered.length / limit) }, source: 'mock' });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug, vp.store_name as vendor_name, vp.is_verified as vendor_verified, vp.id as vendor_profile_id
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
       WHERE p.slug = $1 AND p.is_active = true`,
      [slug]
    );
    if (result.rows.length === 0) {
      const mock = MOCK_PRODUCTS.find(p => p.slug === slug);
      if (mock) return res.json({ product: mock, source: 'mock' });
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ product: result.rows[0], source: 'database' });
  } catch (err) {
    console.error('Get product error:', err.message);
    const mock = MOCK_PRODUCTS.find(p => p.slug === req.params.slug);
    if (mock) return res.json({ product: mock, source: 'mock' });
    res.status(500).json({ error: 'Failed to load product.' });
  }
};

// Get categories
const getCategories = async (req, res) => {
  try {
    const result = await query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    console.error('Get categories error:', err.message);
    const mockCategories = [
      { id: '1', name: 'Running', slug: 'running' },
      { id: '2', name: 'Football', slug: 'football' },
      { id: '3', name: 'Basketball', slug: 'basketball' },
      { id: '4', name: 'Tennis', slug: 'tennis' },
      { id: '5', name: 'Swimming', slug: 'swimming' },
      { id: '6', name: 'Gym & Fitness', slug: 'gym-fitness' },
      { id: '7', name: 'Cycling', slug: 'cycling' },
      { id: '8', name: 'Athletics', slug: 'athletics' },
    ];
    res.json({ categories: mockCategories, source: 'mock' });
  }
};

// Get featured products
const getFeaturedProducts = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as category_name, vp.store_name as vendor_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN vendor_profiles vp ON p.vendor_id = vp.id
       WHERE p.is_active = true AND p.is_featured = true
       ORDER BY p.total_sold DESC LIMIT 12`
    );
    if (result.rows.length === 0) throw new Error('No products found');
    res.json({ products: result.rows, source: 'database' });
  } catch (err) {
    res.json({ products: MOCK_PRODUCTS.filter(p => p.is_featured), source: 'mock' });
  }
};

module.exports = { getProducts, getProduct, getCategories, getFeaturedProducts, MOCK_PRODUCTS };
