const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken, COOKIE_OPTIONS } = require('../config/jwt');
const axios = require('axios');

// Customer Register
const customerRegister = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, phone, role',
      [email, passwordHash, firstName, lastName, phone || null, 'customer']
    );
    const user = result.rows[0];
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role } });
  } catch (err) {
    console.error('Customer register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// Customer Login
const customerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'customer']);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated.' });
    }
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role } });
  } catch (err) {
    console.error('Customer login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// Vendor Register
const vendorRegister = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, storeName, storeDescription } = req.body;
    if (!email || !password || !firstName || !lastName || !storeName) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await query(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, phone, role',
      [email, passwordHash, firstName, lastName, phone || null, 'vendor']
    );
    const user = userResult.rows[0];
    await query(
      'INSERT INTO vendor_profiles (user_id, store_name, store_description) VALUES ($1, $2, $3)',
      [user.id, storeName, storeDescription || null]
    );
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role, storeName } });
  } catch (err) {
    console.error('Vendor register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// Vendor Login
const vendorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'vendor']);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated.' });
    }
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const vendorProfile = await query('SELECT * FROM vendor_profiles WHERE user_id = $1', [user.id]);
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role },
      vendor: vendorProfile.rows[0] || null
    });
  } catch (err) {
    console.error('Vendor login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'admin']);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
};

// Google OAuth
const googleAuth = async (req, res) => {
  try {
    const { credential, role } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required.' });
    }
    // Verify Google token
    const googleRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const { email, given_name, family_name, sub: googleId, picture } = googleRes.data;
    
    let user;
    const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      user = existing.rows[0];
      if (!user.google_id) {
        await query('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3', [googleId, picture, user.id]);
      }
    } else {
      const userRole = role === 'vendor' ? 'vendor' : 'customer';
      const result = await query(
        'INSERT INTO users (email, first_name, last_name, google_id, avatar_url, role, email_verified) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *',
        [email, given_name, family_name || '', googleId, picture, userRole]
      );
      user = result.rows[0];
      if (userRole === 'vendor') {
        await query('INSERT INTO vendor_profiles (user_id, store_name) VALUES ($1, $2)', [user.id, `${given_name}'s Store`]);
      }
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role, avatarUrl: user.avatar_url } });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed.' });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = req.user;
    let vendorProfile = null;
    if (user.role === 'vendor') {
      const vp = await query('SELECT * FROM vendor_profiles WHERE user_id = $1', [user.id]);
      vendorProfile = vp.rows[0] || null;
    }
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, role: user.role, avatarUrl: user.avatar_url }, vendor: vendorProfile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user info.' });
  }
};

// Logout
const logout = (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const result = await query(
      'UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), phone = COALESCE($3, phone), updated_at = NOW() WHERE id = $4 RETURNING id, email, first_name, last_name, phone, role, avatar_url',
      [firstName, lastName, phone, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

module.exports = {
  customerRegister, customerLogin,
  vendorRegister, vendorLogin,
  adminLogin, googleAuth,
  getMe, logout, updateProfile
};
