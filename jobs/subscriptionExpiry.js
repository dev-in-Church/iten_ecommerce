const { query } = require('../config/database');

// Check and expire vendor subscriptions
const checkExpiredSubscriptions = async () => {
  try {
    const result = await query(
      `UPDATE vendor_subscriptions SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at < NOW() RETURNING vendor_id`
    );
    
    // Unverify vendors with expired subscriptions (only those verified by subscription, not by admin)
    for (const row of result.rows) {
      const adminVerified = await query(
        'SELECT verified_by FROM vendor_profiles WHERE id = $1 AND verified_by IS NOT NULL',
        [row.vendor_id]
      );
      // Only unverify if not manually verified by admin
      if (adminVerified.rows.length === 0) {
        await query('UPDATE vendor_profiles SET is_verified = false, updated_at = NOW() WHERE id = $1', [row.vendor_id]);
      }
    }
    
    if (result.rowCount > 0) {
      console.log(`Expired ${result.rowCount} vendor subscriptions.`);
    }
  } catch (err) {
    console.error('Subscription expiry check error:', err);
  }
};

module.exports = { checkExpiredSubscriptions };
