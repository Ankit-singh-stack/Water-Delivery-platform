const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const multer  = require('multer')
const pool    = require('../db/pool')
const { requireAuth, requireAdmin } = require('../middleware/auth')

router.use(requireAuth, requireAdmin)

// ── Multer config for tanker images ──────────────────────────────────────────
const ALLOWED_IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

const tankerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'tankers')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase()
    const name = `tanker_${Date.now()}${ext}`
    cb(null, name)
  },
})
const tankerUpload = multer({
  storage: tankerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) && ALLOWED_IMG_EXTS.has(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'))
    }
  },
})

// GET /admin/states — all active states for dropdowns
router.get('/states', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, state_code, country_code
       FROM states WHERE is_active = TRUE ORDER BY name`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// GET /admin/cities — all cities with state info
router.get('/cities', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.is_active, c.created_at, c.updated_at,
             s.id AS state_id, s.name AS state_name, s.state_code
      FROM   cities c
      JOIN   states s ON s.id = c.state_id
      ORDER  BY s.name, c.name
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /admin/cities — create a city
router.post('/cities', async (req, res, next) => {
  try {
    const { name, stateId } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'city_name_required' })
    if (!stateId)      return res.status(400).json({ error: 'state_required' })

    const { rows: stateRows } = await pool.query(
      'SELECT id FROM states WHERE id = $1 AND is_active = TRUE', [stateId]
    )
    if (!stateRows.length) return res.status(400).json({ error: 'invalid_state' })

    const { rows } = await pool.query(
      `INSERT INTO cities (name, state_id)
       VALUES ($1, $2)
       RETURNING id, name, state_id, is_active, created_at, updated_at`,
      [name.trim(), stateId]
    )
    const { rows: full } = await pool.query(
      `SELECT c.id, c.name, c.is_active, c.created_at, c.updated_at,
              s.id AS state_id, s.name AS state_name, s.state_code
       FROM cities c JOIN states s ON s.id = c.state_id WHERE c.id = $1`,
      [rows[0].id]
    )
    res.status(201).json(full[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'city_already_exists' })
    next(err)
  }
})

// PUT /admin/cities/:id — update name / state
router.put('/cities/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, stateId } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'city_name_required' })
    if (!stateId)      return res.status(400).json({ error: 'state_required' })

    const { rows: stateRows } = await pool.query(
      'SELECT id FROM states WHERE id = $1 AND is_active = TRUE', [stateId]
    )
    if (!stateRows.length) return res.status(400).json({ error: 'invalid_state' })

    const { rows } = await pool.query(
      `UPDATE cities SET name = $1, state_id = $2
       WHERE  id = $3
       RETURNING id`,
      [name.trim(), stateId, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'city_not_found' })
    const { rows: full } = await pool.query(
      `SELECT c.id, c.name, c.is_active, c.created_at, c.updated_at,
              s.id AS state_id, s.name AS state_name, s.state_code
       FROM cities c JOIN states s ON s.id = c.state_id WHERE c.id = $1`,
      [rows[0].id]
    )
    res.json(full[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'city_already_exists' })
    next(err)
  }
})

// PATCH /admin/cities/:id/status — activate / deactivate
router.patch('/cities/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive_required' })

    const { rows } = await pool.query(
      `UPDATE cities SET is_active = $1 WHERE id = $2 RETURNING id`,
      [isActive, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'city_not_found' })
    const { rows: full } = await pool.query(
      `SELECT c.id, c.name, c.is_active, c.created_at, c.updated_at,
              s.id AS state_id, s.name AS state_name, s.state_code
       FROM cities c JOIN states s ON s.id = c.state_id WHERE c.id = $1`,
      [rows[0].id]
    )
    res.json(full[0])
  } catch (err) { next(err) }
})

// ── Role management ──────────────────────────────────────────────────────────
// admin sees every account and can reassign roles among 'user', 'vendor', 'admin'
// (never 'super_admin', and never an account that is currently 'super_admin').
// super_admin sees every account and can reassign any account to any role,
// including promoting to or reassigning other 'super_admin' accounts.

const ASSIGNABLE_ROLES = {
  admin:       ['user', 'vendor', 'admin', 'delivery_partner'],
  super_admin: ['user', 'vendor', 'admin', 'super_admin', 'delivery_partner'],
}

// GET /admin/users — every account with optional pagination (?page=1&limit=50)
router.get('/users', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.created_at,
               COALESCE(r.name, 'user') AS role_name
        FROM   users u
        LEFT JOIN roles r ON r.id = u.role_id
        ORDER  BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query('SELECT COUNT(*)::int AS total FROM users'),
    ])
    res.json({ data: rows, total: countRows[0].total, page, pageSize: limit })
  } catch (err) { next(err) }
})

// PATCH /admin/users/:id/role — reassign a user's role
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params
    const { role } = req.body
    const actorRole = req.user.role_name

    if (id === req.user.user_id) return res.status(400).json({ error: 'cannot_change_own_role' })

    const allowed = ASSIGNABLE_ROLES[actorRole] || []
    if (!allowed.includes(role)) return res.status(403).json({ error: 'role_not_assignable' })

    const { rows: targetRows } = await pool.query(
      `SELECT u.role_id, COALESCE(r.name, 'user') AS role_name
       FROM   users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE  u.id = $1`,
      [id]
    )
    if (!targetRows.length) return res.status(404).json({ error: 'user_not_found' })
    const target = targetRows[0]

    // admin may not touch an account that is currently 'super_admin'; super_admin
    // has no target restriction and may reassign any account, including other
    // super_admin accounts
    if (actorRole === 'admin' && target.role_name === 'super_admin') {
      return res.status(403).json({ error: 'target_not_editable' })
    }

    const { rows: roleRows } = await pool.query('SELECT id FROM roles WHERE name = $1', [role])
    const newRoleId = roleRows[0]?.id
    if (!newRoleId) return res.status(400).json({ error: 'invalid_role' })

    const { rows: updated } = await pool.query(
      `UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, first_name, last_name, email, phone, created_at`,
      [newRoleId, id]
    )

    await pool.query(
      `INSERT INTO role_change_history (user_id, changed_by, old_role_id, new_role_id)
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.user_id, target.role_id, newRoleId]
    )

    res.json({ ...updated[0], role_name: role })
  } catch (err) { next(err) }
})

// ── Tanker Types ─────────────────────────────────────────────────────────────

const TANKER_COLS = `id, name, capacity_litres, base_price, is_active, display_order, image_url, created_at, updated_at`

router.get('/tanker-types', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${TANKER_COLS} FROM tanker_types ORDER BY display_order, name`
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /admin/tanker-types/upload-image — multipart upload, returns { imageUrl }
router.post('/tanker-types/upload-image', tankerUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const imageUrl = `/uploads/tankers/${req.file.filename}`
  res.json({ imageUrl })
})

router.post('/tanker-types', async (req, res, next) => {
  try {
    const { name, capacityLitres, basePrice, displayOrder = 0, imageUrl } = req.body
    if (!name?.trim() || !capacityLitres || !basePrice)
      return res.status(400).json({ error: 'required_fields' })
    const { rows } = await pool.query(
      `INSERT INTO tanker_types (name, capacity_litres, base_price, display_order, image_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING ${TANKER_COLS}`,
      [name.trim(), parseInt(capacityLitres), parseFloat(basePrice), parseInt(displayOrder), imageUrl || null]
    )
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
})

router.put('/tanker-types/:id', async (req, res, next) => {
  try {
    const { name, capacityLitres, basePrice, displayOrder, imageUrl } = req.body
    if (!name?.trim() || !capacityLitres || !basePrice)
      return res.status(400).json({ error: 'required_fields' })
    const { rows } = await pool.query(
      `UPDATE tanker_types
       SET name = $1, capacity_litres = $2, base_price = $3, display_order = $4,
           image_url = COALESCE($5, image_url), updated_at = NOW()
       WHERE id = $6
       RETURNING ${TANKER_COLS}`,
      [name.trim(), parseInt(capacityLitres), parseFloat(basePrice), parseInt(displayOrder ?? 0), imageUrl ?? null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

router.patch('/tanker-types/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive_required' })
    const { rows } = await pool.query(
      `UPDATE tanker_types SET is_active = $1, updated_at = NOW() WHERE id = $2
       RETURNING ${TANKER_COLS}`,
      [isActive, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── Vendor management ─────────────────────────────────────────────────────────

// GET /admin/vendors — all vendor profiles
router.get('/vendors', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT vp.id, vp.company_name, vp.area_name, vp.pincode, vp.is_active, vp.is_online,
             vp.created_at,
             u.id AS user_id, u.first_name, u.last_name, u.email, u.phone,
             c.name AS city_name, s.name AS state_name
      FROM   vendor_profiles vp
      JOIN   users  u ON u.id  = vp.user_id
      LEFT JOIN cities c ON c.id = vp.city_id
      LEFT JOIN states s ON s.id = vp.state_id
      ORDER  BY vp.created_at DESC
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// PATCH /admin/vendors/:id/status — activate / deactivate a vendor profile
router.patch('/vendors/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive_required' })
    const { rows } = await pool.query(
      `UPDATE vendor_profiles SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, company_name, is_active, is_online`,
      [isActive, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'vendor_not_found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── Support tickets ───────────────────────────────────────────────────────────

// GET /admin/support/tickets — all tickets with pagination
router.get('/support/tickets', async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1)
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const offset = (page - 1) * limit
    const status = req.query.status // optional filter

    const where = status ? `WHERE st.status = $3` : ''
    const params = status ? [limit, offset, status] : [limit, offset]

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(`
        SELECT st.id, st.subject, st.message, st.status, st.created_at,
               u.first_name || ' ' || u.last_name AS user_name, u.phone AS user_phone, u.email AS user_email
        FROM   support_tickets st
        JOIN   users u ON u.id = st.user_id
        ${where}
        ORDER  BY st.created_at DESC
        LIMIT $1 OFFSET $2
      `, params),
      pool.query(`SELECT COUNT(*)::int AS total FROM support_tickets${status ? ' WHERE status = $1' : ''}`,
        status ? [status] : []),
    ])
    res.json({ data: rows, total: countRows[0].total, page, pageSize: limit })
  } catch (err) { next(err) }
})

// PATCH /admin/support/tickets/:id — update ticket status
router.patch('/support/tickets/:id', async (req, res, next) => {
  try {
    const { status } = req.body
    const VALID = ['open', 'in_progress', 'resolved', 'closed']
    if (!VALID.includes(status)) return res.status(400).json({ error: 'invalid_status' })
    const { rows } = await pool.query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, subject, status, updated_at`,
      [status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'ticket_not_found' })
    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── Payment refunds ───────────────────────────────────────────────────────────

// POST /admin/orders/:id/refund — issue Razorpay refund
router.post('/orders/:id/refund', async (req, res, next) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'payment_not_configured' })
    }
    const { rows } = await pool.query(
      `SELECT id, payment_status, payment_reference, total_price
       FROM orders WHERE id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'order_not_found' })
    const order = rows[0]
    if (order.payment_status !== 'paid') {
      return res.status(400).json({ error: 'order_not_paid' })
    }
    if (!order.payment_reference) {
      return res.status(400).json({ error: 'no_payment_reference' })
    }

    const Razorpay = require('razorpay')
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })

    const refund = await razorpay.payments.refund(order.payment_reference, {
      amount: Math.round(parseFloat(order.total_price) * 100),
    })

    await pool.query(
      `UPDATE orders SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1`,
      [order.id]
    )

    res.json({ refundId: refund.id, status: refund.status, amount: refund.amount })
  } catch (err) { next(err) }
})

// GET /admin/role-history — audit log of role changes
router.get('/role-history', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT h.id, h.created_at,
             u.first_name || ' ' || u.last_name  AS user_name, u.phone AS user_phone,
             cb.first_name || ' ' || cb.last_name AS changed_by_name,
             oldr.name AS old_role, newr.name AS new_role
      FROM   role_change_history h
      JOIN   users u  ON u.id = h.user_id
      JOIN   users cb ON cb.id = h.changed_by
      LEFT JOIN roles oldr ON oldr.id = h.old_role_id
      LEFT JOIN roles newr ON newr.id = h.new_role_id
      ORDER  BY h.created_at DESC
      LIMIT  200
    `)
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Delivery Partner management (super_admin) ────────────────────────────────

// GET /admin/delivery-partners — list all delivery partners across all vendors
router.get('/delivery-partners', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const { status } = req.query // optional filter: pending | active | suspended | rejected

    const where  = status ? `WHERE dp.status = $3` : ''
    const params = status ? [limit, offset, status] : [limit, offset]

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(`
        SELECT dp.id, dp.vehicle_type, dp.vehicle_number, dp.has_license, dp.license_number,
               dp.service_area, dp.is_online, dp.is_available, dp.status, dp.created_at,
               u.id AS user_id, u.first_name, u.last_name, u.email, u.phone,
               vp.id AS vendor_id, vp.company_name AS vendor_name,
               (SELECT COUNT(*) FROM orders o
                 WHERE o.delivery_partner_id = dp.id AND o.status = 'delivered')::int AS total_deliveries,
               (SELECT COUNT(*) FROM orders o
                 WHERE o.delivery_partner_id = dp.id
                   AND o.status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer'))::int AS active_orders
        FROM   delivery_partner_profiles dp
        JOIN   users u ON u.id = dp.user_id
        JOIN   vendor_profiles vp ON vp.id = dp.vendor_id
        ${where}
        ORDER  BY dp.created_at DESC
        LIMIT $1 OFFSET $2
      `, params),
      pool.query(`SELECT COUNT(*)::int AS total FROM delivery_partner_profiles${status ? ' WHERE status = $1' : ''}`,
        status ? [status] : []),
    ])
    res.json({ data: rows, total: countRows[0].total, page, pageSize: limit })
  } catch (err) { next(err) }
})

// GET /admin/delivery-partners/:id — view a specific delivery partner + history
router.get('/delivery-partners/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { rows } = await pool.query(`
      SELECT dp.*, u.first_name, u.last_name, u.email, u.phone, u.created_at AS account_created_at,
             vp.id AS vendor_id, vp.company_name AS vendor_name
      FROM   delivery_partner_profiles dp
      JOIN   users u ON u.id = dp.user_id
      JOIN   vendor_profiles vp ON vp.id = dp.vendor_id
      WHERE  dp.id = $1
    `, [id])
    if (!rows.length) return res.status(404).json({ error: 'partner_not_found' })

    const { rows: settings } = await pool.query(
      'SELECT earnings_per_delivery FROM delivery_settings WHERE vendor_id = $1',
      [rows[0].vendor_id]
    )
    const rate = settings[0] ? parseFloat(settings[0].earnings_per_delivery) : 30

    const { rows: sum } = await pool.query(
      `SELECT COALESCE(SUM($2::numeric) FILTER (WHERE status = 'delivered'), 0)::numeric AS total_earned,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS total_deliveries,
              COUNT(*) FILTER (WHERE status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer'))::int AS active_orders
       FROM orders WHERE delivery_partner_id = $1`,
      [id, rate]
    )

    const { rows: history } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.delivered_at, o.created_at,
              o.delivery_area_name, o.delivery_city, o.delivered_by
       FROM   orders o
       WHERE  o.delivery_partner_id = $1
       ORDER  BY o.updated_at DESC LIMIT 50`,
      [id]
    )

    res.json({
      ...rows[0],
      earningsPerDelivery: rate,
      totalEarned: sum[0].total_earned,
      totalDeliveries: sum[0].total_deliveries,
      activeOrders: sum[0].active_orders,
      history,
    })
  } catch (err) { next(err) }
})

// PATCH /admin/delivery-partners/:id/status — approve / suspend / deactivate
router.patch('/delivery-partners/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const VALID = ['active', 'suspended', 'rejected']
    if (!VALID.includes(status)) return res.status(400).json({ error: 'invalid_status' })

    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, vehicle_type, vehicle_number, created_at`,
      [status, id]
    )
    if (!rows.length) return res.status(404).json({ error: 'partner_not_found' })

    res.json(rows[0])
  } catch (err) { next(err) }
})

// ── Notifications ──────────────────────────────────────────────────────────

router.get("/notifications/unread-count", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [req.user.user_id]
    );
    res.json({ count: rows[0].count });
  } catch (err) { next(err); }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.user_id, limit, offset],
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1', [req.user.user_id]),
    ]);
    res.json({ data: rows, total: countRows[0].total, page, pageSize: limit });
  } catch (err) { next(err); }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.user_id],
    );
    res.json({ message: "all_read" });
  } catch (err) { next(err); }
});

router.get("/notification-preferences", async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [req.user.user_id],
    );
    const { rows } = await pool.query(
      "SELECT * FROM notification_preferences WHERE user_id = $1",
      [req.user.user_id],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/notification-preferences", async (req, res, next) => {
  try {
    const {
      orderUpdatesInApp, orderUpdatesSms, orderUpdatesEmail,
      paymentUpdatesInApp, paymentUpdatesSms, paymentUpdatesEmail,
      deliveryUpdatesInApp, deliveryUpdatesSms, deliveryUpdatesEmail,
      promotionalInApp, promotionalSms, promotionalEmail,
      systemInApp, systemSms, systemEmail,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO notification_preferences (
         user_id, order_updates_in_app, order_updates_sms, order_updates_email,
         payment_updates_in_app, payment_updates_sms, payment_updates_email,
         delivery_updates_in_app, delivery_updates_sms, delivery_updates_email,
         promotional_in_app, promotional_sms, promotional_email,
         system_in_app, system_sms, system_email
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (user_id) DO UPDATE SET
         order_updates_in_app  = COALESCE($2,  notification_preferences.order_updates_in_app),
         order_updates_sms     = COALESCE($3,  notification_preferences.order_updates_sms),
         order_updates_email   = COALESCE($4,  notification_preferences.order_updates_email),
         payment_updates_in_app = COALESCE($5,  notification_preferences.payment_updates_in_app),
         payment_updates_sms   = COALESCE($6,  notification_preferences.payment_updates_sms),
         payment_updates_email = COALESCE($7,  notification_preferences.payment_updates_email),
         delivery_updates_in_app = COALESCE($8,  notification_preferences.delivery_updates_in_app),
         delivery_updates_sms  = COALESCE($9,  notification_preferences.delivery_updates_sms),
         delivery_updates_email = COALESCE($10, notification_preferences.delivery_updates_email),
         promotional_in_app    = COALESCE($11, notification_preferences.promotional_in_app),
         promotional_sms       = COALESCE($12, notification_preferences.promotional_sms),
         promotional_email     = COALESCE($13, notification_preferences.promotional_email),
         system_in_app         = COALESCE($14, notification_preferences.system_in_app),
         system_sms            = COALESCE($15, notification_preferences.system_sms),
         system_email          = COALESCE($16, notification_preferences.system_email),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.user_id,
        orderUpdatesInApp, orderUpdatesSms, orderUpdatesEmail,
        paymentUpdatesInApp, paymentUpdatesSms, paymentUpdatesEmail,
        deliveryUpdatesInApp, deliveryUpdatesSms, deliveryUpdatesEmail,
        promotionalInApp, promotionalSms, promotionalEmail,
        systemInApp, systemSms, systemEmail,
      ],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router
