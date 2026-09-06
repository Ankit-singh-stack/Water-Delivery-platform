const pool = require('../db/pool');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { rows } = await pool.query(
      `SELECT s.user_id, u.first_name, u.last_name, u.email, u.phone,
              u.phone_verified, r.name AS role_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: 'Session expired' });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role_name !== 'admin' && req.user.role_name !== 'super_admin') {
    return res.status(403).json({ error: 'admin_only' });
  }
  next();
}

async function requireVendor(req, res, next) {
  if (req.user.role_name !== 'vendor') {
    return res.status(403).json({ error: 'vendor_only' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, city_id FROM vendor_profiles WHERE user_id = $1 AND is_active = TRUE',
      [req.user.user_id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'vendor_profile_required' });
    req.vendorProfileId = rows[0].id;
    req.vendorCityId    = rows[0].city_id;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireDeliveryPartner(req, res, next) {
  if (req.user.role_name !== 'delivery_partner') {
    return res.status(403).json({ error: 'delivery_partner_only' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, vendor_id, status FROM delivery_partner_profiles WHERE user_id = $1',
      [req.user.user_id]
    );
    const profile = rows[0];
    if (!profile) return res.status(403).json({ error: 'delivery_profile_required' });
    if (profile.status !== 'active') {
      return res.status(403).json({ error: 'delivery_profile_not_active' });
    }
    req.deliveryPartnerId = profile.id;
    req.deliveryVendorId  = profile.vendor_id;
    next();
  } catch (err) {
    next(err);
  }
}

// Lighter guard: the user must be a delivery partner with a profile, but any
// account status is allowed. Used only for read-only status introspection so a
// pending/blocked partner can still see their approval state on the dashboard.
async function requireDeliveryProfile(req, res, next) {
  if (req.user.role_name !== 'delivery_partner') {
    return res.status(403).json({ error: 'delivery_partner_only' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, vendor_id, status FROM delivery_partner_profiles WHERE user_id = $1',
      [req.user.user_id]
    );
    const profile = rows[0];
    if (!profile) return res.status(403).json({ error: 'delivery_profile_required' });
    req.deliveryPartnerId = profile.id;
    req.deliveryVendorId  = profile.vendor_id;
    req.deliveryStatus    = profile.status;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireVendor, requireAdmin, requireDeliveryPartner, requireDeliveryProfile };
