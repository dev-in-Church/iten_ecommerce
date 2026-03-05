const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Database query error:', err.message);
    throw err;
  }
};

const getClient = () => pool.connect();

const testConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
};

module.exports = { pool, query, getClient, testConnection };
