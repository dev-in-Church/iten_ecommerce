const { verifyToken } = require('../config/jwt');
const { query } = require('../config/database');

// Authenticate any user
const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    const decoded = verifyToken(token);
    const result = await query('SELECT id, email, first_name, last_name, phone, role, is_active, avatar_url FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }
    if (!result.rows[0].is_active) {
      return res.status(403).json({ error: 'Account has been deactivated.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = verifyToken(token);
      const result = await query('SELECT id, email, first_name, last_name, phone, role, is_active, avatar_url FROM users WHERE id = $1', [decoded.id]);
      if (result.rows.length > 0 && result.rows[0].is_active) {
        req.user = result.rows[0];
      }
    }
  } catch (err) {
    // Silent fail - user just won't be authenticated
  }
  next();
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
};

// Vendor must be verified
const requireVerifiedVendor = async (req, res, next) => {
  try {
    if (req.user.role !== 'vendor') {
      return res.status(403).json({ error: 'Vendor access required.' });
    }
    const result = await query('SELECT is_verified FROM vendor_profiles WHERE user_id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor profile not found.' });
    }
    if (!result.rows[0].is_verified) {
      return res.status(403).json({ error: 'Your vendor account is not yet verified. Please complete verification.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
};

module.exports = { authenticate, optionalAuth, authorize, requireVerifiedVendor };
