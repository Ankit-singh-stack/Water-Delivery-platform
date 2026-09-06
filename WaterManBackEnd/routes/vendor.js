const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool    = require("../db/pool");
const { requireAuth, requireVendor } = require("../middleware/auth");
const { notifyUser } = require("../utils/socketManager");
const { createDeliveryOtp } = require("../utils/deliveryOtp");
const { notify } = require("../services/notification");
const T         = require("../templates/notifications");

const router = express.Router();
router.use(requireAuth, requireVendor);

// ── Helpers ───────────────────────────────────────────────────────────────────

function orderRow(r, includePhone = true) {
  return {
    id:                      r.id,
    order_number:            r.order_number,
    status:                  r.status,
    user_id:                 r.user_id,
    customer_name:           r.customer_name,
    // Only expose phone/email once vendor has accepted the order
    customer_phone:          includePhone ? r.customer_phone : undefined,
    customer_email:          includePhone ? r.customer_email : undefined,
    delivery_door_no:        r.delivery_door_no,
    delivery_plot_no:        r.delivery_plot_no,
    delivery_building_name:  r.delivery_building_name,
    delivery_street_name:    r.delivery_street_name,
    delivery_area_name:      r.delivery_area_name,
    delivery_city:           r.delivery_city,
    delivery_state:          r.delivery_state,
    delivery_partner_id:     r.delivery_partner_id,
    delivery_partner_name:   r.delivery_partner_name,
    delivery_partner_latitude:  r.delivery_partner_latitude,
    delivery_partner_longitude: r.delivery_partner_longitude,
    tanker_type_name:        r.tanker_type_name,
    tanker_type_id:          r.tanker_type_id,
    quantity:                r.quantity,
    unit_price:              r.unit_price,
    total_price:             r.total_price,
    delivery_charge:         r.delivery_charge,
    scheduled_at:            r.scheduled_at,
    accepted_at:             r.accepted_at,
    preparing_at:            r.preparing_at,
    ready_at:                r.ready_at,
    assigned_at:             r.assigned_at,
    picked_up_at:            r.picked_up_at,
    out_for_delivery_at:     r.out_for_delivery_at,
    in_transit_at:           r.in_transit_at,
    arrived_at_customer_at:  r.arrived_at_customer_at,
    delivered_at:            r.delivered_at,
    created_at:              r.created_at,
  };
}

const ORDER_WITH_CUSTOMER = `
  SELECT o.*,
         u.first_name || ' ' || u.last_name AS customer_name,
         u.phone AS customer_phone,
         u.email AS customer_email,
         tt.name AS tanker_type_name,
         dpp.latitude  AS delivery_partner_latitude,
         dpp.longitude AS delivery_partner_longitude,
         dup.first_name || ' ' || dup.last_name AS delivery_partner_name
  FROM   orders o
  JOIN   users  u ON u.id = o.user_id
  LEFT JOIN tanker_types tt ON tt.id = o.tanker_type_id
  LEFT JOIN delivery_partner_profiles dpp ON dpp.id = o.delivery_partner_id
  LEFT JOIN users dup ON dup.id = dpp.user_id
`;

/**
 * @openapi
 * /vendor/orders:
 *   get:
 *     tags: [Vendor]
 *     summary: Get available orders in vendor's city and vendor's own orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ available: [...], mine: [...] }"
 */
router.get("/orders", async (req, res, next) => {
  try {
    // Vendor's city name
    const { rows: cityRows } = await pool.query(
      "SELECT c.name FROM cities c WHERE c.id = $1",
      [req.vendorCityId]
    );
    const cityName = cityRows[0]?.name;
    if (!cityName) return res.json({ available: [], mine: [] });

    // Check if vendor is online — offline vendors can still see their accepted orders
    // but won't see new available orders
    const { rows: vpRows } = await pool.query(
      "SELECT is_online FROM vendor_profiles WHERE id = $1",
      [req.vendorProfileId]
    );
    const isOnline = vpRows[0]?.is_online ?? false;

    const [avail, mine] = await Promise.all([
      isOnline ? pool.query(
        `${ORDER_WITH_CUSTOMER}
         WHERE o.status = 'confirmed'
           AND o.delivery_city ILIKE $1
         ORDER BY o.created_at ASC`,
        [cityName]
      ) : Promise.resolve({ rows: [] }),
      pool.query(
        `${ORDER_WITH_CUSTOMER}
         WHERE o.vendor_id = $1
           AND o.status IN ('accepted','preparing','ready_for_pickup','assigned','delivery_accepted','arrived_at_pickup','picked_up','in_transit','out_for_delivery','arrived_at_customer','delivered','rejected')
         ORDER BY o.updated_at DESC`,
        [req.vendorProfileId]
      ),
    ]);

    res.json({
      available: avail.rows.map(r => orderRow(r, true)),
      mine:      mine.rows.map(r => orderRow(r, true)),
    });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /vendor/orders/{id}/accept:
 *   patch:
 *     tags: [Vendor]
 *     summary: Accept an available order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Order accepted
 *       404:
 *         description: Order not available
 */
router.patch("/orders/:id/accept", async (req, res, next) => {
  const client = await require("../db/pool").connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const { rows: cityRows } = await client.query(
      "SELECT c.name FROM cities c WHERE c.id = $1",
      [req.vendorCityId]
    );
    const cityName = cityRows[0]?.name;

    const { rows } = await client.query(
      `UPDATE orders
       SET status = 'accepted', vendor_id = $1, accepted_at = NOW(), updated_at = NOW()
       WHERE id = $2
         AND status = 'confirmed'
         AND delivery_city ILIKE $3
       RETURNING *`,
      [req.vendorProfileId, id, cityName]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "order_not_available" });
    }
    const order = rows[0];

    // Fetch vendor details
    const { rows: vRows } = await client.query(
      `SELECT vp.company_name, u.phone
       FROM vendor_profiles vp JOIN users u ON u.id = vp.user_id
       WHERE vp.id = $1`,
      [req.vendorProfileId]
    );
    const vendor = vRows[0];

    // The notification recipient is the customer who created the order
    // (orders.user_id), never the vendor/admin who accepted it.
    console.log(`[Notification] Accepted order customer userId: ${order.user_id}`);
    await notify(pool, {
      userId: order.user_id,
      template: T.VENDOR_ORDER_ACCEPTED({
        orderNumber: order.order_number,
        vendorName: vendor?.company_name,
        deliveryAreaName: order.delivery_area_name,
        deliveryCity: order.delivery_city,
      }),
      orderId: order.id,
    });

    await client.query("COMMIT");

    notifyUser(order.user_id, 'order-updated', {
      orderId:       order.id,
      orderNumber:   order.order_number,
      status:        'accepted',
      acceptedAt:    order.accepted_at,
      vendorCompany: vendor?.company_name,
      vendorPhone:   vendor?.phone,
    });

    res.json(orderRow({ ...order, customer_name: '', customer_phone: '' }));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/**
 * @openapi
 * /vendor/orders/{id}/reject:
 *   patch:
 *     tags: [Vendor]
 *     summary: Reject a confirmed or accepted order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Order rejected
 *       404:
 *         description: Order not found
 */
router.patch("/orders/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: cityRows } = await pool.query(
      "SELECT c.name FROM cities c WHERE c.id = $1",
      [req.vendorCityId]
    );
    const cityName = cityRows[0]?.name;

    // If the vendor had already accepted the order, mark it rejected and notify.
    // If the order is still 'confirmed' (vendor declining before accepting),
    // leave it 'confirmed' so other vendors in the city can still pick it up.
    const { rows: ownedRows } = await pool.query(
      `UPDATE orders
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
         AND status IN ('accepted','preparing')
         AND vendor_id = $2
       RETURNING *`,
      [id, req.vendorProfileId]
    );

    if (ownedRows[0]) {
      // Vendor had accepted it — permanently rejected
      const order = ownedRows[0];
      await notify(pool, {
        userId: order.user_id,
        template: T.VENDOR_ORDER_REJECTED({ orderNumber: order.order_number }),
        orderId: order.id,
      });
      notifyUser(order.user_id, 'order-updated', { orderId: order.id, orderNumber: order.order_number, status: 'rejected' });
      return res.json(orderRow({ ...order, customer_name: '', customer_phone: '' }));
    }

    // Vendor is declining a confirmed order they haven't accepted yet
    const { rows: availRows } = await pool.query(
      `SELECT * FROM orders
       WHERE id = $1 AND status = 'confirmed' AND delivery_city ILIKE $2`,
      [id, cityName]
    );
    if (!availRows[0]) return res.status(404).json({ error: "order_not_found" });

    // Return the order as-is (still confirmed); vendor UI should remove from their available list
    res.json(orderRow({ ...availRows[0], customer_name: '', customer_phone: '' }));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /vendor/orders/{id}/status:
 *   patch:
 *     tags: [Vendor]
 *     summary: Advance order status (accepted→preparing→in_transit→delivered)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [preparing, in_transit, delivered]
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Order not found
 */
// Body: { status: 'preparing' | 'in_transit' | 'delivered' }

const ALLOWED_TRANSITIONS = {
  accepted:  ['preparing'],
  preparing: ['ready_for_pickup'],
  // The vendor stops at ready_for_pickup — from here the order must be assigned
  // to a delivery partner (manual or auto) using the assignment endpoints below.
};

const STATUS_LABELS = {
  preparing:        'Preparing Delivery',
  ready_for_pickup: 'Ready for Pickup',
};

const STATUS_MESSAGES = {
  preparing:        (num, city) => `Your order #${num} is being prepared for delivery in ${city}.`,
  ready_for_pickup: (num) => `Your order #${num} is ready for pickup by the delivery partner.`,
};

router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    // Fetch current order
    const { rows: cur } = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND vendor_id = $2",
      [id, req.vendorProfileId]
    );
    if (!cur[0]) return res.status(404).json({ error: "order_not_found" });
    const order = cur[0];

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return res.status(400).json({ error: "invalid_transition", allowed });
    }

    // Build timestamp column
    const tsCol = newStatus === 'preparing'        ? 'preparing_at'
                : newStatus === 'ready_for_pickup' ? 'ready_at'
                : 'ready_at';

    const { rows } = await pool.query(
      `UPDATE orders
       SET status = $1, ${tsCol} = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, id]
    );
    const updated = rows[0];

    // Notification
    const template = newStatus === 'ready_for_pickup'
      ? T.ORDER_READY_FOR_PICKUP({ orderNumber: updated.order_number })
      : T.ORDER_PREPARING({ orderNumber: updated.order_number, deliveryCity: updated.delivery_city });

    await notify(pool, {
      userId: updated.user_id,
      template,
      orderId: updated.id,
    });
    notifyUser(updated.user_id, 'order-updated', {
      orderId:     updated.id,
      orderNumber: updated.order_number,
      status:      newStatus,
      readyAt:     updated.ready_at,
    });

    res.json(orderRow({ ...updated, customer_name: '', customer_phone: '' }));
  } catch (err) { next(err); }
});

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

// ── Earnings ──────────────────────────────────────────────────────────────────

router.get("/earnings", async (req, res, next) => {
  try {
    const { rows: vpRows } = await pool.query(
      "SELECT id, is_online FROM vendor_profiles WHERE user_id = $1", [req.user.user_id]
    );
    if (!vpRows[0]) return res.status(404).json({ error: "vendor_profile_not_found" });

    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'),               0)::numeric AS total_earned,
         COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'
           AND delivered_at >= date_trunc('month', NOW())),                            0)::numeric AS this_month,
         COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'
           AND delivered_at >= date_trunc('week', NOW())),                             0)::numeric AS this_week,
         COUNT(*) FILTER (WHERE status = 'delivered')                                             AS total_deliveries,
         COUNT(*) FILTER (WHERE status IN ('confirmed','accepted','preparing','in_transit'))       AS active_orders
       FROM orders WHERE vendor_id = $1`,
      [vpRows[0].id]
    );
    res.json({ ...rows[0], isOnline: vpRows[0].is_online });
  } catch (err) { next(err); }
});

// PATCH /vendor/work-mode — toggle online/offline
router.patch("/work-mode", async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    if (typeof isOnline !== "boolean") return res.status(400).json({ error: "isOnline_required" });

    const { rows } = await pool.query(
      `UPDATE vendor_profiles SET is_online = $1, updated_at = NOW()
       WHERE user_id = $2 RETURNING id, is_online`,
      [isOnline, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "vendor_profile_not_found" });

    await pool.query(
      `INSERT INTO vendor_online_status_history (vendor_id, is_online) VALUES ($1, $2)`,
      [rows[0].id, rows[0].is_online]
    );

    res.json({ isOnline: rows[0].is_online });
  } catch (err) { next(err); }
});

// ── Ratings summary ───────────────────────────────────────────────────────────

router.get("/ratings/summary", async (req, res, next) => {
  try {
    const { rows: vpRows } = await pool.query(
      "SELECT id FROM vendor_profiles WHERE user_id = $1", [req.user.user_id]
    );
    if (!vpRows[0]) return res.status(404).json({ error: "vendor_profile_not_found" });

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int                      AS total_ratings,
         ROUND(AVG(rating)::numeric, 1)     AS average_rating,
         COUNT(*) FILTER (WHERE rating = 5) AS five_star,
         COUNT(*) FILTER (WHERE rating = 4) AS four_star,
         COUNT(*) FILTER (WHERE rating = 3) AS three_star,
         COUNT(*) FILTER (WHERE rating = 2) AS two_star,
         COUNT(*) FILTER (WHERE rating = 1) AS one_star
       FROM order_ratings WHERE vendor_id = $1`,
      [vpRows[0].id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Vendor tanker fleet ───────────────────────────────────────────────────────

router.get("/tankers", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT vt.*, tt.name AS tanker_type_name
       FROM vendor_tankers vt
       LEFT JOIN tanker_types tt ON tt.id = vt.tanker_type_id
       WHERE vt.vendor_id = $1
       ORDER BY vt.created_at DESC`,
      [req.vendorProfileId]
    );
    res.json(rows.map(r => ({
      id:              r.id,
      vendorId:        r.vendor_id,
      tankerTypeId:    r.tanker_type_id,
      tankerTypeName:  r.tanker_type_name,
      registrationNo:  r.registration_no,
      capacityLiters:  r.capacity_liters,
      isActive:        r.is_active,
      notes:           r.notes,
      createdAt:       r.created_at,
    })));
  } catch (err) { next(err); }
});

router.post("/tankers", async (req, res, next) => {
  try {
    const { registrationNo, capacityLiters, tankerTypeId, notes } = req.body;
    if (!registrationNo || !capacityLiters) {
      return res.status(400).json({ error: "registrationNo_and_capacityLiters_required" });
    }
    const { rows } = await pool.query(
      `INSERT INTO vendor_tankers (vendor_id, tanker_type_id, registration_no, capacity_liters, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.vendorProfileId, tankerTypeId || null, registrationNo, capacityLiters, notes || null]
    );
    const r = rows[0];
    res.status(201).json({
      id: r.id, vendorId: r.vendor_id, tankerTypeId: r.tanker_type_id, tankerTypeName: null,
      registrationNo: r.registration_no, capacityLiters: r.capacity_liters,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
    });
  } catch (err) { next(err); }
});

router.patch("/tankers/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { registrationNo, capacityLiters, tankerTypeId, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE vendor_tankers
       SET registration_no = COALESCE($1, registration_no),
           capacity_liters = COALESCE($2, capacity_liters),
           tanker_type_id  = COALESCE($3::uuid, tanker_type_id),
           notes           = COALESCE($4, notes),
           updated_at      = NOW()
       WHERE id = $5 AND vendor_id = $6
       RETURNING *`,
      [registrationNo || null, capacityLiters || null, tankerTypeId || null, notes ?? null, id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "tanker_not_found" });
    const r = rows[0];
    res.json({
      id: r.id, vendorId: r.vendor_id, tankerTypeId: r.tanker_type_id, tankerTypeName: null,
      registrationNo: r.registration_no, capacityLiters: r.capacity_liters,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
    });
  } catch (err) { next(err); }
});

router.patch("/tankers/:id/toggle", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE vendor_tankers SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND vendor_id = $2 RETURNING *`,
      [id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "tanker_not_found" });
    const r = rows[0];
    res.json({ id: r.id, isActive: r.is_active });
  } catch (err) { next(err); }
});

router.delete("/tankers/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "DELETE FROM vendor_tankers WHERE id = $1 AND vendor_id = $2 RETURNING id",
      [id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "tanker_not_found" });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Delivery Partner management (vendor) ────────────────────────────────────

// GET /vendor/delivery-partners — list the vendor's delivery partners
router.get("/delivery-partners", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.id, dp.user_id, dp.vehicle_type, dp.vehicle_number, dp.is_online,
              dp.is_available, dp.status, dp.created_at,
              dp.latitude, dp.longitude, dp.last_location_at,
              u.first_name, u.last_name, u.phone,
              (SELECT o.order_number FROM orders o
                WHERE o.delivery_partner_id = dp.id
                  AND o.status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer')
                ORDER BY o.updated_at DESC LIMIT 1) AS active_order_number,
              (SELECT COUNT(*) FROM orders o WHERE o.delivery_partner_id = dp.id AND o.status = 'delivered')::int AS total_deliveries
       FROM   delivery_partner_profiles dp
       JOIN   users u ON u.id = dp.user_id
       WHERE  dp.vendor_id = $1
       ORDER  BY dp.created_at DESC`,
      [req.vendorProfileId]
    );
    res.json(rows.map(r => ({
      id: r.id, userId: r.user_id, vehicleType: r.vehicle_type,
      vehicleNumber: r.vehicle_number, isOnline: r.is_online, isAvailable: r.is_available,
      status: r.status, createdAt: r.created_at,
      firstName: r.first_name, lastName: r.last_name, phone: r.phone,
      activeOrderNumber: r.active_order_number, totalDeliveries: r.total_deliveries,
      latitude: r.latitude, longitude: r.longitude, lastLocationAt: r.last_location_at,
    })));
  } catch (err) { next(err); }
});

// POST /vendor/delivery-partners — add a new delivery partner (creates account + pending profile)
router.post("/delivery-partners", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { firstName, lastName, email, phone, vehicleType, vehicleNumber, licenseNumber, hasLicense } = req.body;
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: "required_fields" });
    }

    await client.query("BEGIN");

    const { rows: roleRows } = await client.query(
      "SELECT id FROM roles WHERE name = 'delivery_partner'"
    );
    const roleId = roleRows[0]?.id;
    if (!roleId) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "delivery_role_missing" });
    }

    // Phone uniqueness check
    const { rows: phoneRows } = await client.query(
      "SELECT id FROM users WHERE phone = $1", [phone]
    );
    if (phoneRows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "phone_exists" });
    }
    if (email) {
      const { rows: emailRows } = await client.query(
        "SELECT id FROM users WHERE email = $1", [email.toLowerCase()]
      );
      if (emailRows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "email_exists" });
      }
    }

    // Use a random password — partner will reset it via the forgot-password flow.
    const tempPassword = crypto.randomBytes(16).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { rows: userRows } = await client.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role_id, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [firstName, lastName, email ? email.toLowerCase() : null, phone, passwordHash, roleId]
    );
    const userId = userRows[0].id;

    const { rows: profRows } = await client.query(
      `INSERT INTO delivery_partner_profiles
         (user_id, vendor_id, vehicle_type, vehicle_number, license_number, has_license, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [userId, req.vendorProfileId, vehicleType || null, vehicleNumber || null,
       licenseNumber || null, !!hasLicense]
    );

    await client.query("COMMIT");
    res.status(201).json({
      id: profRows[0].id, userId, status: "pending",
      firstName, lastName, email: email ? email.toLowerCase() : null, phone,
      vehicleType, vehicleNumber, licenseNumber, hasLicense: !!hasLicense,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// GET /vendor/delivery-partners/unassigned — self-registered partners not yet claimed by any vendor
// Only partners in the calling vendor's city (or those without a declared city) are shown, so a
// vendor only sees & approves signups it is actually able to serve.
router.get("/delivery-partners/unassigned", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.id, dp.user_id, dp.vehicle_type, dp.vehicle_number, dp.is_online,
              dp.is_available, dp.status, dp.city_id, dp.created_at,
              c.name AS city_name,
              u.first_name, u.last_name, u.phone, u.email
       FROM   delivery_partner_profiles dp
       JOIN   users u ON u.id = dp.user_id
       LEFT JOIN cities c ON c.id = dp.city_id
       WHERE  dp.vendor_id IS NULL AND dp.status = 'pending'
         AND (dp.city_id = $1 OR dp.city_id IS NULL)
       ORDER  BY dp.created_at DESC`,
      [req.vendorCityId ?? null]
    );
    res.json(rows.map(r => ({
      id: r.id, userId: r.user_id, vehicleType: r.vehicle_type,
      vehicleNumber: r.vehicle_number, isOnline: r.is_online, isAvailable: r.is_available,
      status: r.status, cityId: r.city_id, cityName: r.city_name, createdAt: r.created_at,
      firstName: r.first_name, lastName: r.last_name, phone: r.phone, email: r.email,
    })));
  } catch (err) { next(err); }
});

// GET /vendor/delivery-partners/:id — view a partner (their profile + delivery history + earnings)
router.get("/delivery-partners/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT dp.*, u.first_name, u.last_name, u.email, u.phone, u.created_at AS account_created_at
       FROM   delivery_partner_profiles dp
       JOIN   users u ON u.id = dp.user_id
       WHERE  dp.id = $1 AND dp.vendor_id = $2`,
      [id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "partner_not_found" });

    await pool.query(
      `INSERT INTO delivery_settings (vendor_id) VALUES ($1)
       ON CONFLICT (vendor_id) DO NOTHING`,
      [req.vendorProfileId]
    );
    const { rows: settings } = await pool.query(
      "SELECT earnings_per_delivery, fee_5km, fee_7km FROM delivery_settings WHERE vendor_id = $1",
      [req.vendorProfileId]
    );
    const fee5km = Number(settings[0]?.fee_5km ?? 600);
    const fee7km = Number(settings[0]?.fee_7km ?? 700);
    const rate = settings[0] ? parseFloat(settings[0].earnings_per_delivery) : 30;

    const { rows: sum } = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE status='delivered'),0)::numeric AS total_earned,
              COUNT(*) FILTER (WHERE status='delivered')::int AS total_deliveries,
              COUNT(*) FILTER (WHERE status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer'))::int AS active_orders
       FROM orders o WHERE delivery_partner_id = $1`,
      [id, fee5km]
    );

    const { rows: history } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.delivered_at, o.created_at,
              o.delivery_area_name, o.delivery_city, o.delivery_fee, o.delivery_distance_km
       FROM   orders o
       WHERE  o.delivery_partner_id = $1
       ORDER  BY o.updated_at DESC LIMIT 50`,
      [id]
    );

    res.json({
      ...rows[0],
      earningsPerDelivery: fee5km,
      deliveryFees: { fee5km, fee7km },
      totalEarned: sum[0].total_earned,
      totalDeliveries: sum[0].total_deliveries,
      activeOrders: sum[0].active_orders,
      history: history.map(h => ({
        ...h,
        earnings: h.delivery_fee != null ? Number(h.delivery_fee) : fee5km,
        distanceKm: h.delivery_distance_km,
      })),
    });
  } catch (err) { next(err); }
});

// PATCH /vendor/delivery-partners/:id/status — activate / suspend / reject
router.patch("/delivery-partners/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ["pending", "active", "suspended", "rejected", "active", "deactivated"];
    const normalized = status === "deactivated" ? "suspended" : status;
    if (!["active", "suspended", "rejected"].includes(normalized)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles SET status = $1, updated_at = NOW()
       WHERE id = $2 AND vendor_id = $3 RETURNING id, status`,
      [normalized, id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "partner_not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /vendor/delivery-partners/:id/availability — vendor force-toggles online/available
router.patch("/delivery-partners/:id/availability", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isOnline, isAvailable } = req.body;
    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles
       SET is_online = COALESCE($1, is_online), is_available = COALESCE($2, is_available), updated_at = NOW()
       WHERE id = $3 AND vendor_id = $4
       RETURNING id, is_online, is_available`,
      [
        typeof isOnline === "boolean" ? isOnline : null,
        typeof isAvailable === "boolean" ? isAvailable : null,
        id, req.vendorProfileId
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "partner_not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /vendor/delivery-partners/:id — remove/unassign a partner
router.delete("/delivery-partners/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM delivery_partner_profiles WHERE id = $1 AND vendor_id = $2 RETURNING id`,
      [id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "partner_not_found" });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /vendor/delivery-partners/:id/claim — claim an unassigned partner and activate them
// Only partners in the calling vendor's city can be claimed by that vendor.
router.post("/delivery-partners/:id/claim", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch partner + vendor company for the same-city guard and the approval notification.
    const { rows: partnerRows } = await pool.query(
      `SELECT dp.id, dp.user_id, dp.city_id
       FROM   delivery_partner_profiles dp
       JOIN   users u ON u.id = dp.user_id
       WHERE  dp.id = $1 AND dp.vendor_id IS NULL AND dp.status = 'pending'`,
      [id]
    );
    if (!partnerRows[0]) return res.status(404).json({ error: "partner_not_found" });

    const partner = partnerRows[0];
    if (partner.city_id && req.vendorCityId && partner.city_id !== req.vendorCityId) {
      return res.status(403).json({ error: "city_mismatch" });
    }

    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles
       SET    vendor_id = $1, status = 'active', updated_at = NOW()
       WHERE  id = $2 AND vendor_id IS NULL
       RETURNING id`,
      [req.vendorProfileId, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "partner_not_found" });

    // Notify the newly approved partner (in-app + real-time socket push) so their
    // dashboard immediately leaves the "pending approval" state.
    const { rows: vendorRows } = await pool.query(
      "SELECT company_name FROM vendor_profiles WHERE id = $1",
      [req.vendorProfileId]
    );
    const vendorName = vendorRows[0]?.company_name || "your vendor";

    await notify(pool, {
      userId: partner.user_id,
      template: T.PARTNER_APPROVED({ vendorName }),
    }).then(() => notifyUser(partner.user_id, "partner-approved", {
      status: "active",
      vendorId: req.vendorProfileId,
      vendorName,
    }));

    res.json({ id: rows[0].id, status: 'active' });
  } catch (err) { next(err); }
});

// ── Delivery settings (vendor) ───────────────────────────────────────────────

// GET /vendor/delivery-settings
router.get("/delivery-settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO delivery_settings (vendor_id) VALUES ($1)
       ON CONFLICT (vendor_id) DO NOTHING`,
      [req.vendorProfileId]
    );
    const { rows: settings } = await pool.query(
      "SELECT * FROM delivery_settings WHERE vendor_id = $1",
      [req.vendorProfileId]
    );
    const s = settings[0] || { earnings_per_delivery: 30, fee_5km: 600, fee_7km: 700, auto_assign: false, assign_timeout_sec: 90 };
    res.json({
      earningsPerDelivery: parseFloat(s.earnings_per_delivery),
      fee5km: Number(s.fee_5km ?? 600),
      fee7km: Number(s.fee_7km ?? 700),
      autoAssign: !!s.auto_assign,
      assignTimeoutSec: s.assign_timeout_sec,
    });
  } catch (err) { next(err); }
});

// PUT /vendor/delivery-settings
router.put("/delivery-settings", async (req, res, next) => {
  try {
    const { earningsPerDelivery, fee5km, fee7km, autoAssign, assignTimeoutSec } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO delivery_settings (vendor_id, earnings_per_delivery, fee_5km, fee_7km, auto_assign, assign_timeout_sec)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vendor_id) DO UPDATE SET
         earnings_per_delivery = EXCLUDED.earnings_per_delivery,
         fee_5km = EXCLUDED.fee_5km,
         fee_7km = EXCLUDED.fee_7km,
         auto_assign = EXCLUDED.auto_assign,
         assign_timeout_sec = EXCLUDED.assign_timeout_sec,
         updated_at = NOW()
       RETURNING earnings_per_delivery, fee_5km, fee_7km, auto_assign, assign_timeout_sec`,
      [
        req.vendorProfileId,
        earningsPerDelivery ?? 30,
        fee5km != null ? fee5km : 600,
        fee7km != null ? fee7km : 700,
        autoAssign ?? false,
        assignTimeoutSec ?? 90
      ]
    );
    const s = rows[0];
    res.json({
      earningsPerDelivery: parseFloat(s.earnings_per_delivery),
      fee5km: Number(s.fee_5km ?? 600),
      fee7km: Number(s.fee_7km ?? 700),
      autoAssign: !!s.auto_assign,
      assignTimeoutSec: s.assign_timeout_sec,
    });
  } catch (err) { next(err); }
});

// ── Order delivery assignment ────────────────────────────────────────────────

// GET /vendor/orders/:id/assignments — assignment history for an order
router.get("/orders/:id/assignments", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT oa.id, oa.status, oa.expires_at, oa.assigned_at, oa.accepted_at, oa.rejected_at, oa.completed_at,
              dp.id AS partner_id,
              u.first_name || ' ' || u.last_name AS partner_name, u.phone AS partner_phone
       FROM   order_assignments oa
       JOIN   orders o ON o.id = oa.order_id
       JOIN   delivery_partner_profiles dp ON dp.id = oa.delivery_partner_id
       JOIN   users u ON u.id = dp.user_id
       WHERE  oa.order_id = $1 AND o.vendor_id = $2
       ORDER  BY oa.created_at ASC`,
      [req.params.id, req.vendorProfileId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /vendor/orders/:id/available-partners — candidates for assignment
router.get("/orders/:id/available-partners", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: orderRows } = await pool.query(
      "SELECT id, status, delivery_city FROM orders WHERE id = $1 AND vendor_id = $2",
      [id, req.vendorProfileId]
    );
    if (!orderRows[0]) return res.status(404).json({ error: "order_not_found" });
    const order = orderRows[0];

    const { rows: partners } = await pool.query(
      `SELECT dp.id, dp.vendor_id, dp.is_online, dp.is_available, dp.status, dp.latitude, dp.longitude,
              u.first_name, u.last_name, u.phone, u.email,
              (SELECT COUNT(*) FROM orders o
                WHERE o.delivery_partner_id = dp.id
                  AND o.status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer'))::int AS active_orders,
              (SELECT oa.status FROM order_assignments oa
                WHERE oa.order_id = $1 AND oa.delivery_partner_id = dp.id
                ORDER BY oa.created_at DESC LIMIT 1) AS last_assignment_status
       FROM   delivery_partner_profiles dp
       JOIN   users u ON u.id = dp.user_id
       WHERE  (dp.vendor_id = $2 AND dp.status = 'active')
           OR (dp.vendor_id IS NULL AND dp.status = 'active' AND dp.is_online = TRUE)
       ORDER  BY CASE WHEN dp.vendor_id = $2 THEN 0 ELSE 1 END, dp.is_online DESC, dp.is_available DESC, dp.status`,
      [id, req.vendorProfileId]
    );
    res.json(partners.map(p => ({
      id: p.id, name: `${p.first_name} ${p.last_name}`, phone: p.phone,
      email: p.email, firstName: p.first_name, lastName: p.last_name,
      isOnline: p.is_online, isAvailable: p.is_available, status: p.status,
      activeOrders: p.active_orders, lastAssignmentStatus: p.last_assignment_status,
      vendorId: p.vendor_id,
      latitude: p.latitude, longitude: p.longitude,
    })));
  } catch (err) { next(err); }
});

// Create a pending assignment for a partner and notify them in real time.
async function createAssignment(order, partnerId, expiresAt) {
  const { rows } = await pool.query(
    `INSERT INTO order_assignments (order_id, delivery_partner_id, status, expires_at, assigned_at)
     VALUES ($1, $2, 'pending', $3, NOW())
     RETURNING id`,
    [order.id, partnerId, expiresAt]
  );
  const assignmentId = rows[0].id;
  // Notify the delivery partner user.
  const { rows: pRows } = await pool.query(
    "SELECT user_id FROM delivery_partner_profiles WHERE id = $1", [partnerId]
  );
  const partnerUserId = pRows[0]?.user_id;
  if (partnerUserId) {
    await notify(pool, {
      userId: partnerUserId,
      template: T.DELIVERY_ASSIGNED({ orderNumber: order.order_number }),
      orderId: order.id,
    });
    notifyUser(partnerUserId, "delivery-request", {
      assignmentId, orderId: order.id, orderNumber: order.order_number,
      pickup: order.delivery_city, deliveryCity: order.delivery_city,
    });
  }
  return assignmentId;
}

// POST /vendor/orders/:id/assign — assign order to a specific delivery partner
router.post("/orders/:id/assign", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { deliveryPartnerId, expiresInSec } = req.body;
    if (!deliveryPartnerId) return res.status(400).json({ error: "deliveryPartnerId_required" });

    await client.query("BEGIN");

    const { rows: oRows } = await client.query(
      "SELECT id, status, order_number, user_id FROM orders WHERE id = $1 AND vendor_id = $2",
      [id, req.vendorProfileId]
    );
    if (!oRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "order_not_found" }); }
    const order = oRows[0];
    if (order.status !== "ready_for_pickup") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "order_not_ready" });
    }

    // Verify partner can take this assignment: the vendor's own active partner,
    // or an online independent (vendor-less) active partner.
    const { rows: pRows } = await client.query(
      `SELECT id, status FROM delivery_partner_profiles
       WHERE id = $1 AND status = 'active'
         AND (vendor_id = $2 OR (vendor_id IS NULL AND is_online = TRUE))`,
      [deliveryPartnerId, req.vendorProfileId]
    );
    if (!pRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "partner_not_found" }); }
    if (pRows[0].status !== "active") { await client.query("ROLLBACK"); return res.status(400).json({ error: "partner_not_active" }); }

    // Advance the order to 'assigned' + set the delivery partner.
    const { rows: upRows } = await client.query(
      `UPDATE orders
       SET status = 'assigned', delivery_partner_id = $1, assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [deliveryPartnerId, id]
    );
    const updatedOrder = upRows[0];

    const timeoutSec = expiresInSec || 90;
    const assignmentId = await createAssignment({
      id: order.id, order_number: order.order_number, delivery_city: updatedOrder.delivery_city,
    }, deliveryPartnerId, new Date(Date.now() + timeoutSec * 1000));

    await client.query("COMMIT");

    // Notify the customer that a partner is being assigned.
    // (createAssignment already notified the partner.)

    res.json({ assignmentId, orderId: updatedOrder.id, orderNumber: updatedOrder.order_number, status: "assigned", timeoutSec });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// POST /vendor/orders/:id/auto-assign — find nearest available partner and assign
router.post("/orders/:id/auto-assign", async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: oRows } = await pool.query(
      "SELECT id, status, delivery_city FROM orders WHERE id = $1 AND vendor_id = $2",
      [id, req.vendorProfileId]
    );
    if (!oRows[0]) return res.status(404).json({ error: "order_not_found" });
    const order = oRows[0];
    if (order.status !== "ready_for_pickup") {
      return res.status(400).json({ error: "order_not_ready" });
    }

    const { rows: settings } = await pool.query(
      `INSERT INTO delivery_settings (vendor_id) VALUES ($1) ON CONFLICT (vendor_id) DO NOTHING`,
      [req.vendorProfileId]
    );
    const { rows: settingsRows } = await pool.query(
      "SELECT earnings_per_delivery, assign_timeout_sec FROM delivery_settings WHERE vendor_id = $1",
      [req.vendorProfileId]
    );
    const timeoutSec = settingsRows[0]?.assign_timeout_sec ?? 90;

    // Find eligible partners: the vendor's own active/online/available first,
    // then online independent (vendor-less) active partners as a fallback.
    const { rows: partners } = await pool.query(
      `SELECT dp.id FROM delivery_partner_profiles dp
       WHERE dp.status = 'active' AND dp.is_online = TRUE
         AND (dp.vendor_id = $1 OR dp.vendor_id IS NULL)
         AND NOT EXISTS (
           SELECT 1 FROM orders o
           WHERE o.delivery_partner_id = dp.id
             AND o.status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer')
         )
       ORDER  BY CASE WHEN dp.vendor_id = $1 THEN 0 ELSE 1 END,
                 dp.is_available DESC,
                 dp.latitude IS NULL, dp.longitude IS NULL
       LIMIT 1`,
      [req.vendorProfileId]
    );
    if (!partners[0]) {
      return res.status(400).json({ error: "no_available_partners" });
    }

    // Do the assignment (reuse the same logic as manual assign).
    const partnerId = partners[0].id;
    const { rows: fullOrder } = await pool.query(
      `UPDATE orders SET status = 'assigned', delivery_partner_id = $1, assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [partnerId, id]
    );
    const updatedOrder = fullOrder[0];
    const assignmentId = await createAssignment({
      id: order.id, order_number: updatedOrder.order_number, delivery_city: updatedOrder.delivery_city,
    }, partnerId, new Date(Date.now() + timeoutSec * 1000));

    res.json({ assignmentId, orderId: updatedOrder.id, orderNumber: updatedOrder.order_number, status: "assigned", partnerId, timeoutSec });
  } catch (err) { next(err); }
});

// POST /vendor/orders/:id/generate-delivery-otp — (re)generate the delivery confirmation OTP
router.post("/orders/:id/generate-delivery-otp", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT id, user_id, order_number, status FROM orders WHERE id = $1 AND vendor_id = $2",
      [id, req.vendorProfileId]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_found" });
    const order = rows[0];
    if (!['out_for_delivery', 'arrived_at_customer'].includes(order.status)) {
      return res.status(400).json({ error: "otp_not_yet" });
    }
    const { devOtp } = await createDeliveryOtp(order.id, order.user_id);
    res.json({ message: "delivery_otp_generated", ...(devOtp ? { devOtp } : {}) });
  } catch (err) { next(err); }
});

module.exports = router;
