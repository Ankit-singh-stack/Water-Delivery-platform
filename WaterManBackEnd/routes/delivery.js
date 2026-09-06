const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../db/pool");
const { requireAuth, requireDeliveryPartner, requireDeliveryProfile } = require("../middleware/auth");
const { notifyUser } = require("../utils/socketManager");
const { otpExpiresAt } = require("../utils/otp");
const { notify } = require("../services/notification");
const T         = require("../templates/notifications");

const router = express.Router();
router.use(requireAuth, requireDeliveryPartner);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Delivery-status transitions allowed for a delivery partner.
const DELIVERY_TRANSITIONS = {
  assigned:              ["delivery_accepted"],
  delivery_accepted:     ["arrived_at_pickup"],
  arrived_at_pickup:     ["picked_up"],
  picked_up:             ["out_for_delivery"],
  out_for_delivery:      ["arrived_at_customer"],
  arrived_at_customer:   ["delivered"],
};

const STATUS_LABELS = {
  assigned:            "Assigned",
  delivery_accepted:   "Delivery Accepted",
  arrived_at_pickup:   "Arrived at Pickup",
  picked_up:           "Picked Up",
  out_for_delivery:    "Out for Delivery",
  arrived_at_customer: "Arrived at Customer",
  delivered:           "Delivered",
};

// Maps a status to the orders.* timestamp column that records when it happened.
// arrived_at_pickup has no dedicated column on orders.
const STATUS_TS = {
  delivery_accepted:   "accepted_at",
  picked_up:           "picked_up_at",
  out_for_delivery:    "out_for_delivery_at",
  arrived_at_customer: "arrived_at_customer_at",
};

const ORDER_WITH_DETAILS = `
  SELECT o.*,
         u.first_name || ' ' || u.last_name AS customer_name,
         u.phone  AS customer_phone,
         vp.company_name AS vendor_company,
         vp.street_name  AS vendor_street,
         vp.area_name    AS vendor_area,
         vc.name         AS vendor_city,
         tt.name         AS tanker_type_name,
         tt.capacity_litres
  FROM   orders o
  JOIN   users            u   ON u.id  = o.user_id
  JOIN   vendor_profiles  vp  ON vp.id = o.vendor_id
  LEFT JOIN cities        vc  ON vc.id = vp.city_id
  LEFT JOIN tanker_types  tt  ON tt.id = o.tanker_type_id
`;

// Fetch the delivery_settings row for this partner's vendor, creating a default
// row if one doesn't exist yet (so earnings config always resolves).
async function getSettings(vendorId) {
  // Independent (vendor-less) partner has no vendor-specific settings row; use a
  // sensible default earnings rate for the dashboard & earnings screens.
  if (!vendorId) {
    return {
      vendor_id: null,
      earnings_per_delivery: 30.00,
      fee_5km:              600.00,
      fee_7km:              700.00,
      auto_assign:          false,
      assign_timeout_sec:   90,
    };
  }
  const { rows } = await pool.query(
    `INSERT INTO delivery_settings (vendor_id)
     VALUES ($1)
     ON CONFLICT (vendor_id) DO NOTHING
     RETURNING *`,
    [vendorId]
  );
  if (rows[0]) return rows[0];
  const { rows: existing } = await pool.query(
    "SELECT * FROM delivery_settings WHERE vendor_id = $1", [vendorId]
  );
  return existing[0];
}

// Haversine great-circle distance in kilometres.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Total distance actually driven on an order, summed from the driver_locations
// track recorded live while on the delivery. Returns null when there is no track
// (e.g. location tracking wasn't active) so callers can fall back to the 5km tier.
// Accepts the transaction client so it can run inside confirm-otp's transaction.
async function orderRouteKm(orderId, db = pool) {
  const { rows } = await db.query(
    `SELECT latitude, longitude
     FROM   driver_locations
     WHERE  order_id = $1
     ORDER  BY created_at ASC`,
    [orderId]
  );
  if (rows.length < 2) return null;
  let km = 0;
  for (let i = 1; i < rows.length; i++) {
    km += haversineKm(
      rows[i - 1].latitude, rows[i - 1].longitude,
      rows[i].latitude,     rows[i].longitude
    );
  }
  return km;
}

// ── Profile & availability ────────────────────────────────────────────────────

// GET /delivery/me — the partner's own profile
router.get("/me", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.id, dp.vendor_id, dp.vehicle_type, dp.vehicle_number,
              dp.has_license, dp.license_number, dp.service_area,
              dp.is_online, dp.is_available, dp.status,
              dp.latitude, dp.longitude, dp.created_at,
              u.first_name, u.last_name, u.email, u.phone,
              vp.company_name AS vendor_company
       FROM   delivery_partner_profiles dp
       JOIN   users u  ON u.id  = dp.user_id
       LEFT JOIN vendor_profiles vp ON vp.id = dp.vendor_id
       WHERE  dp.id = $1`,
      [req.deliveryPartnerId]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const r = rows[0];
    res.json({
      id: r.id, vendorId: r.vendor_id, vehicleType: r.vehicle_type,
      vehicleNumber: r.vehicle_number, hasLicense: r.has_license,
      licenseNumber: r.license_number, serviceArea: r.service_area,
      isOnline: r.is_online, isAvailable: r.is_available, status: r.status,
      latitude: r.latitude, longitude: r.longitude, createdAt: r.created_at,
      firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone,
      vendorCompany: r.vendor_company,
    });
  } catch (err) { next(err); }
});

// PATCH /delivery/profile — update vehicle / license / service area
router.patch("/profile", async (req, res, next) => {
  try {
    const { vehicleType, vehicleNumber, hasLicense, licenseNumber, serviceArea } = req.body;
    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles
       SET vehicle_type   = COALESCE($1, vehicle_type),
           vehicle_number = COALESCE($2, vehicle_number),
           has_license    = COALESCE($3, has_license),
           license_number = COALESCE($4, license_number),
           service_area   = COALESCE($5, service_area),
           updated_at     = NOW()
       WHERE id = $6
       RETURNING id`,
      [
        vehicleType ?? null, vehicleNumber ?? null,
        typeof hasLicense === "boolean" ? hasLicense : null,
        licenseNumber ?? null, serviceArea ?? null,
        req.deliveryPartnerId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ message: "profile_updated" });
  } catch (err) { next(err); }
});

// PATCH /delivery/availability — toggle online + available/busy
router.patch("/availability", async (req, res, next) => {
  try {
    const { isOnline, isAvailable } = req.body;

    // Block toggling if partner is not yet approved by a vendor
    const { rows: meRows } = await pool.query(
      "SELECT status FROM delivery_partner_profiles WHERE id = $1",
      [req.deliveryPartnerId]
    );
    if (!meRows[0]) return res.status(404).json({ error: "not_found" });
    if (meRows[0].status === 'pending') {
      return res.status(403).json({ error: "awaiting_vendor_approval", message: "Your account is pending vendor approval. You cannot go online until a vendor approves your signup." });
    }
    if (meRows[0].status === 'suspended' || meRows[0].status === 'rejected') {
      return res.status(403).json({ error: "account_" + meRows[0].status, message: "Your account has been " + meRows[0].status + ". Contact your vendor for more information." });
    }

    const { rows } = await pool.query(
      `UPDATE delivery_partner_profiles
       SET is_online    = COALESCE($1, is_online),
           is_available = COALESCE($2, is_available),
           updated_at   = NOW()
       WHERE id = $3
       RETURNING id, is_online, is_available`,
      [
        typeof isOnline === "boolean" ? isOnline : null,
        typeof isAvailable === "boolean" ? isAvailable : null,
        req.deliveryPartnerId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ isOnline: rows[0].is_online, isAvailable: rows[0].is_available });
  } catch (err) { next(err); }
});

// PATCH /delivery/location — optional live location while online / on a delivery
router.patch("/location", async (req, res, next) => {
  try {
    const { latitude, longitude, orderId } = req.body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ error: "latitude_longitude_required" });
    }
    await pool.query(
      `UPDATE delivery_partner_profiles
       SET latitude = $1, longitude = $2, last_location_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [latitude, longitude, req.deliveryPartnerId]
    );
    if (orderId) {
      await pool.query(
        `INSERT INTO driver_locations (delivery_partner_id, order_id, latitude, longitude)
         VALUES ($1, $2, $3, $4)`,
        [req.deliveryPartnerId, orderId, latitude, longitude]
      );

      // Live-push the partner's position to the order's customer and vendor so
      // their tracking screens update in real time (no polling).
      const { rows: orderRows } = await pool.query(
        `SELECT o.user_id, vp.user_id AS vendor_user_id
         FROM   orders o
         LEFT JOIN vendor_profiles vp ON vp.id = o.vendor_id
         WHERE  o.id = $1`,
        [orderId]
      );
      const evt = { orderId, latitude, longitude, updatedAt: new Date().toISOString() };
      if (orderRows[0]?.user_id) notifyUser(orderRows[0].user_id, "delivery-location", evt);
      if (orderRows[0]?.vendor_user_id) notifyUser(orderRows[0].vendor_user_id, "delivery-location", evt);
    }
    res.json({ message: "location_updated" });
  } catch (err) { next(err); }
});

// ── Dashboard + requests ─────────────────────────────────────────────────────

// GET /delivery/dashboard
router.get("/dashboard", async (req, res, next) => {
  try {
    const settings = await getSettings(req.deliveryVendorId);
    // Legacy orders (placed before per-order fees existed) have no delivery_fee;
    // fall back to the 5km tier amount for them.
    const fee5km = Number(settings.fee_5km ?? 600);
    const fee7km = Number(settings.fee_7km ?? 700);

    const [reqRes, activeRes, todayRes, earningsRes] = await Promise.all([
      // pending delivery requests
      pool.query(
        `SELECT oa.id AS assignment_id, oa.status AS assignment_status, oa.expires_at,
                o.id AS order_id, o.order_number, o.delivery_area_name, o.delivery_city,
                o.quantity, tt.name AS tanker_type_name, tt.capacity_litres,
                vp.company_name AS vendor_company
         FROM   order_assignments oa
         JOIN   orders o ON o.id = oa.order_id
         LEFT JOIN tanker_types tt ON tt.id = o.tanker_type_id
         JOIN vendor_profiles vp ON vp.id = o.vendor_id
         WHERE  oa.delivery_partner_id = $1 AND oa.status = 'pending'
         ORDER  BY oa.created_at DESC`,
        [req.deliveryPartnerId]
      ),
      // active delivery
      pool.query(
        `SELECT o.id, o.order_number, o.status, o.delivery_partner_id
         FROM   orders o
         WHERE  o.delivery_partner_id = $1
           AND  o.status IN ('assigned','delivery_accepted','arrived_at_pickup','picked_up','out_for_delivery','arrived_at_customer')
         ORDER  BY o.updated_at DESC LIMIT 1`,
        [req.deliveryPartnerId]
      ),
      // today's stats
      pool.query(
        `SELECT COUNT(*)::int AS today_deliveries,
                COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE o.status = 'delivered' AND o.delivered_at >= date_trunc('day', NOW())), 0)::numeric AS today_earnings
         FROM   orders o
         WHERE  o.delivery_partner_id = $1`,
        [req.deliveryPartnerId, fee5km]
      ),
      // earnings summary
      pool.query(
        `SELECT COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE o.status='delivered'), 0)::numeric AS total_earned,
                COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE o.status='delivered' AND o.delivered_at >= date_trunc('month', NOW())), 0)::numeric AS this_month,
                COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE o.status='delivered' AND o.delivered_at >= date_trunc('week', NOW())), 0)::numeric AS this_week,
                COUNT(*) FILTER (WHERE o.status='delivered')::int AS total_deliveries
         FROM   orders o
         WHERE  o.delivery_partner_id = $1`,
        [req.deliveryPartnerId, fee5km]
      ),
    ]);

    const { rows: meRows } = await pool.query(
      "SELECT is_online, is_available, status FROM delivery_partner_profiles WHERE id = $1",
      [req.deliveryPartnerId]
    );

    res.json({
      status: meRows[0]?.status ?? 'pending',
      isOnline: meRows[0]?.is_online ?? false,
      isAvailable: meRows[0]?.is_available ?? true,
      pendingRequests: reqRes.rows,
      activeDelivery: activeRes.rows[0] ?? null,
      todayDeliveries: todayRes.rows[0].today_deliveries,
      todayEarnings: todayRes.rows[0].today_earnings,
      earningsPerDelivery: fee5km,
      deliveryFees: { fee5km, fee7km },
      totalEarned: earningsRes.rows[0].total_earned,
      thisMonth: earningsRes.rows[0].this_month,
      thisWeek: earningsRes.rows[0].this_week,
      totalDeliveries: earningsRes.rows[0].total_deliveries,
      todayDeliveriesCount: todayRes.rows[0].today_deliveries,
    });
  } catch (err) { next(err); }
});

// GET /delivery/orders/:id — detail of an assigned order (pickup, customer, items)
router.get("/orders/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${ORDER_WITH_DETAILS}
       WHERE o.id = $1 AND o.delivery_partner_id = $2`,
      [req.params.id, req.deliveryPartnerId]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_found" });
    const o = rows[0];
    res.json({
      id: o.id, orderNumber: o.order_number, status: o.status,
      customerName: o.customer_name, customerPhone: o.customer_phone,
      pickup: {
        company: o.vendor_company, street: o.vendor_street,
        area: o.vendor_area, city: o.vendor_city,
      },
      delivery: {
        doorNo: o.delivery_door_no, streetName: o.delivery_street_name,
        areaName: o.delivery_area_name, city: o.delivery_city, state: o.delivery_state,
        latitude: o.delivery_latitude, longitude: o.delivery_longitude,
      },
      items: { tankerTypeName: o.tanker_type_name, capacityLitres: o.capacity_litres, quantity: o.quantity },
      timestamps: {
        acceptedAt: o.accepted_at, readyAt: o.ready_at, assignedAt: o.assigned_at,
        pickedUpAt: o.picked_up_at, outForDeliveryAt: o.out_for_delivery_at,
        deliveredAt: o.delivered_at,
      },
      createdAt: o.created_at,
    });
  } catch (err) { next(err); }
});

// GET /delivery/deliveries — assigned deliveries (active + history)
router.get("/deliveries", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.delivery_area_name, o.delivery_city,
              o.delivered_at, o.created_at, o.ready_at, o.picked_up_at, o.out_for_delivery_at,
              u.first_name || ' ' || u.last_name AS customer_name,
              tt.name AS tanker_type_name, o.quantity
       FROM   orders o
       JOIN   users u ON u.id = o.user_id
       LEFT JOIN tanker_types tt ON tt.id = o.tanker_type_id
       WHERE  o.delivery_partner_id = $1
       ORDER  BY o.updated_at DESC`,
      [req.deliveryPartnerId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /delivery/requests — pending requests (with order info)
router.get("/requests", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT oa.id AS assignment_id, oa.expires_at, oa.created_at,
              o.id AS order_id, o.order_number, o.delivery_area_name, o.delivery_city,
              o.quantity, tt.name AS tanker_type_name, tt.capacity_litres,
              vp.company_name AS vendor_company
       FROM   order_assignments oa
       JOIN   orders o ON o.id = oa.order_id
       LEFT JOIN tanker_types tt ON tt.id = o.tanker_type_id
       JOIN vendor_profiles vp ON vp.id = o.vendor_id
       WHERE  oa.delivery_partner_id = $1 AND oa.status = 'pending'
       ORDER  BY oa.created_at DESC`,
      [req.deliveryPartnerId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /delivery/requests/:assignmentId/accept
router.post("/requests/:assignmentId/accept", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { assignmentId } = req.params;
    await client.query("BEGIN");

    const { rows: aRows } = await client.query(
      `SELECT oa.*, o.id AS order_id, o.status AS order_status, o.order_number,
              o.vendor_id AS order_vendor_id
       FROM   order_assignments oa
       JOIN   orders o ON o.id = oa.order_id
       WHERE  oa.id = $1 AND oa.delivery_partner_id = $2`,
      [assignmentId, req.deliveryPartnerId]
    );
    const assignment = aRows[0];
    if (!assignment) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "assignment_not_found" });
    }
    if (assignment.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "assignment_not_pending" });
    }
    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "assignment_expired" });
    }
    if (assignment.order_status !== "assigned") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "order_not_assigned" });
    }
    // A vendor-tied partner may only accept orders from their own vendor. An
    // independent (vendor-less) partner may accept any order assigned to them.
    if (req.deliveryVendorId && assignment.order_vendor_id !== req.deliveryVendorId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "vendor_mismatch" });
    }

    // Mark all other pending assignments for this order as cancelled, then accept this one.
    await client.query(
      `UPDATE order_assignments SET status = 'cancelled', updated_at = NOW()
       WHERE order_id = $1 AND id != $2 AND status = 'pending'`,
      [assignment.order_id, assignmentId]
    );
    await client.query(
      `UPDATE order_assignments SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [assignmentId]
    );

    // Set the delivery partner on the order + advance order status.
    const { rows: oRows } = await client.query(
      `UPDATE orders
       SET delivery_partner_id = $1, status = 'delivery_accepted', assigned_at = NOW(),
           accepted_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'assigned'
       RETURNING *`,
      [req.deliveryPartnerId, assignment.order_id]
    );
    if (!oRows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "order_no_longer_assignable" });
    }
    const order = oRows[0];

    // Notify the order's vendor that the delivery partner accepted.
    const { rows: vendorUsers } = await client.query(
      "SELECT user_id FROM vendor_profiles WHERE id = $1", [order.vendor_id]
    );
    const vendorUserId = vendorUsers[0]?.user_id;
    if (vendorUserId) {
      await notify(pool, {
        userId: vendorUserId,
        template: T.DELIVERY_PARTNER_ACCEPTED({ orderNumber: order.order_number }),
        orderId: order.id,
      });
    }

    // Notify the customer that a delivery partner is on the way to pick up.
    await notify(pool, {
      userId: order.user_id,
      template: T.CUSTOMER_DELIVERY_ASSIGNED({ orderNumber: order.order_number }),
      orderId: order.id,
    });

    await client.query("COMMIT");

    if (vendorUserId) notifyUser(vendorUserId, "delivery-updated", { orderId: order.id, orderNumber: order.order_number, status: "delivery_accepted" });
    notifyUser(order.user_id, "order-updated", { orderId: order.id, orderNumber: order.order_number, status: "delivery_accepted" });

    res.json({ message: "delivery_accepted", orderId: order.id, status: "delivery_accepted" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// POST /delivery/requests/:assignmentId/reject
router.post("/requests/:assignmentId/reject", async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { rows } = await pool.query(
      `UPDATE order_assignments SET status = 'rejected', rejected_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND delivery_partner_id = $2 AND status = 'pending'
       RETURNING order_id`,
      [assignmentId, req.deliveryPartnerId]
    );
    if (!rows[0]) return res.status(404).json({ error: "assignment_not_found" });

    // Reopen the order to the assignment pool if it's still assigned but no
    // other partner has accepted it yet.
    const orderId = rows[0].order_id;
    const { rows: still } = await pool.query(
      `SELECT id FROM order_assignments
       WHERE order_id = $1 AND status = 'pending' LIMIT 1`,
      [orderId]
    );
    res.json({ message: "delivery_rejected", remainingPending: still.length > 0 });
  } catch (err) { next(err); }
});

// ── Delivery status flow ──────────────────────────────────────────────────────

// PATCH /delivery/orders/:id/status — advance delivery status (role-controlled)
router.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: nextStatus, latitude, longitude } = req.body;

    const { rows: cur } = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND delivery_partner_id = $2",
      [id, req.deliveryPartnerId]
    );
    if (!cur[0]) return res.status(404).json({ error: "order_not_found" });
    const order = cur[0];

    const allowed = DELIVERY_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(nextStatus)) {
      return res.status(400).json({ error: "invalid_transition", allowed });
    }

    // Delivered requires OTP verification, handled by a separate endpoint.
    if (nextStatus === "delivered") {
      return res.status(400).json({ error: "use_otp_confirmation" });
    }

    const tsCol = STATUS_TS[nextStatus];
    const tsClause = tsCol ? `, ${tsCol} = NOW()` : "";
    const inTransitClause = nextStatus === "out_for_delivery" ? ", in_transit_at = NOW()" : "";

    const { rows } = await pool.query(
      `UPDATE orders SET status = $1${tsClause}${inTransitClause}, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [nextStatus, id]
    );
    const updated = rows[0];

    // Persist live location with the status bump if provided.
    if (typeof latitude === "number" && typeof longitude === "number") {
      await pool.query(
        `UPDATE delivery_partner_profiles SET latitude = $1, longitude = $2, last_location_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [latitude, longitude, req.deliveryPartnerId]
      );
      await pool.query(
        `INSERT INTO driver_locations (delivery_partner_id, order_id, latitude, longitude)
         VALUES ($1, $2, $3, $4)`,
        [req.deliveryPartnerId, id, latitude, longitude]
      );
    }

    const title   = `Order #${updated.order_number} — ${STATUS_LABELS[nextStatus]}`;
    const message = `Your order #${updated.order_number} ${nextStatus.replace(/_/g, ' ')}.`;

    const templateMap = {
      out_for_delivery: T.ORDER_OUT_FOR_DELIVERY,
    };
    const templateFn = templateMap[nextStatus];
    if (templateFn) {
      await notify(pool, {
        userId: updated.user_id,
        template: templateFn({ orderNumber: updated.order_number }),
        orderId: updated.id,
      });
    }
    notifyUser(updated.user_id, "order-updated", {
      orderId: updated.id, orderNumber: updated.order_number, status: nextStatus,
    });

    res.json({ id: updated.id, orderNumber: updated.order_number, status: nextStatus });
  } catch (err) { next(err); }
});

// POST /delivery/orders/:id/confirm-otp — verify delivery OTP to mark delivered
router.post("/orders/:id/confirm-otp", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { otp, latitude, longitude } = req.body;
    if (!otp) return res.status(400).json({ error: "otp_required" });

    await client.query("BEGIN");

    const { rows: oRows } = await client.query(
      "SELECT * FROM orders WHERE id = $1 AND delivery_partner_id = $2",
      [id, req.deliveryPartnerId]
    );
    if (!oRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "order_not_found" });
    }
    const order = oRows[0];
    if (order.status !== "arrived_at_customer") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "otp_not_expected" });
    }

    const { rows: otps } = await client.query(
      `SELECT id, code_hash, expires_at, attempts, max_attempts, used
       FROM delivery_otps
       WHERE order_id = $1 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (!otps[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "no_otp_generated" });
    }
    const rec = otps[0];
    if (new Date(rec.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "otp_expired" });
    }
    if (rec.attempts >= rec.max_attempts) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "otp_max_attempts" });
    }

    const match = await bcrypt.compare(otp, rec.code_hash);
    if (!match) {
      await client.query(
        "UPDATE delivery_otps SET attempts = attempts + 1 WHERE id = $1",
        [rec.id]
      );
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "otp_invalid" });
    }

    // Mark OTP used.
    await client.query("UPDATE delivery_otps SET used = TRUE WHERE id = $1", [rec.id]);

    // Mark the assignment completed.
    await client.query(
      `UPDATE order_assignments SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 AND status = 'accepted'`,
      [id]
    );

    const { rows: updated } = await client.query(
      `UPDATE orders
       SET status = 'delivered', delivered_at = NOW(),
           delivered_by = (SELECT first_name || ' ' || last_name FROM users WHERE id = $1),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.user_id, id]
    );

    // Distance-based delivery fee: measure the route the partner actually drove
    // (from the recorded driver_locations track) and charge the 5km / 7km tier
    // for that distance. No track → assume the 5km tier.
    const distanceKm = await orderRouteKm(id, client);
    const settings   = await getSettings(order.vendor_id);
    const fee = (distanceKm == null || distanceKm <= 5)
      ? Number(settings.fee_5km ?? 600)
      : Number(settings.fee_7km ?? 700);
    await client.query(
      `UPDATE orders
       SET    delivery_distance_km = $1,
              delivery_fee         = $2,
              total_price          = COALESCE(total_price, 0) + $2
       WHERE  id = $3`,
      [distanceKm != null ? Number(distanceKm.toFixed(2)) : null, fee, id]
    );

    if (typeof latitude === "number" && typeof longitude === "number") {
      await client.query(
        `UPDATE delivery_partner_profiles SET latitude = $1, longitude = $2, last_location_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [latitude, longitude, req.deliveryPartnerId]
      );
    }

    // Mark partner available again after completing the delivery.
    await client.query(
      `UPDATE delivery_partner_profiles SET is_available = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [req.deliveryPartnerId]
    );

    // Notify customer + vendor.
    await notify(pool, {
      userId: order.user_id,
      template: T.ORDER_DELIVERED({ orderNumber: order.order_number }),
      orderId: order.id,
    });
    const { rows: vp } = await pool.query("SELECT user_id FROM vendor_profiles WHERE id = $1", [order.vendor_id]);
    if (vp[0]) {
      await notify(pool, {
        userId: vp[0].user_id,
        template: T.ORDER_DELIVERED_VENDOR({ orderNumber: order.order_number }),
        orderId: order.id,
      });
    }

    await client.query("COMMIT");

    notifyUser(order.user_id, "order-updated", { orderId: order.id, orderNumber: order.order_number, status: "delivered" });
    if (vp[0]) notifyUser(vp[0].user_id, "delivery-updated", { orderId: order.id, orderNumber: order.order_number, status: "delivered" });

    res.json({
      message: "delivery_confirmed",
      orderNumber: order.order_number,
      status: "delivered",
      deliveryFee: fee,
      deliveryDistanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
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

// GET /delivery/earnings — summary + history
router.get("/earnings", async (req, res, next) => {
  try {
    const settings = await getSettings(req.deliveryVendorId);
    // Legacy orders without a recorded per-order fee fall back to the 5km tier.
    const fee5km = Number(settings.fee_5km ?? 600);
    const fee7km = Number(settings.fee_7km ?? 700);

    const { rows } = await pool.query(
      `SELECT o.id, o.order_number, o.delivered_at, o.created_at,
              o.delivery_area_name, o.delivery_city,
              o.delivery_fee, o.delivery_distance_km
       FROM   orders o
       WHERE  o.delivery_partner_id = $1 AND o.status = 'delivered'
       ORDER  BY o.delivered_at DESC`,
      [req.deliveryPartnerId]
    );

    const { rows: sum } = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE status = 'delivered'), 0)::numeric AS total_earned,
              COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('month', NOW())), 0)::numeric AS this_month,
              COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('week', NOW())), 0)::numeric AS this_week,
              COALESCE(SUM(COALESCE(o.delivery_fee, $2::numeric)) FILTER (WHERE status = 'delivered' AND delivered_at >= date_trunc('day', NOW())), 0)::numeric AS today_earnings
       FROM   orders o
       WHERE  o.delivery_partner_id = $1`,
      [req.deliveryPartnerId, fee5km]
    );

    res.json({
      earningsPerDelivery: fee5km,
      deliveryFees: { fee5km, fee7km },
      totalEarned: sum[0].total_earned,
      thisMonth:   sum[0].this_month,
      thisWeek:    sum[0].this_week,
      todayEarnings: sum[0].today_earnings,
      history: rows.map(r => ({
        id: r.id, orderNumber: r.order_number, deliveredAt: r.delivered_at,
        createdAt: r.created_at, area: r.delivery_area_name, city: r.delivery_city,
        earnings: r.delivery_fee != null ? Number(r.delivery_fee) : fee5km,
        distanceKm: r.delivery_distance_km,
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;

// ── Profile status (lightweight, status-agnostic) ────────────────────────────
// A pending/blocked partner cannot pass `requireDeliveryPartner`, so this
// separate router answers a read-only status check so the dashboard can render
// the correct "pending approval" / "blocked" state instead of a generic failure.
const statusRouter = express.Router();
statusRouter.use(requireAuth, requireDeliveryProfile);

// GET /delivery/status — the partner's own approval status
statusRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.status, dp.is_online, dp.is_available,
              vp.company_name AS vendor_name
       FROM   delivery_partner_profiles dp
       LEFT JOIN vendor_profiles vp ON vp.id = dp.vendor_id
       WHERE  dp.id = $1`,
      [req.deliveryPartnerId]
    );
    const p = rows[0];
    if (!p) return res.status(404).json({ error: "delivery_profile_required" });
    res.json({
      status: p.status,
      isOnline: p.is_online,
      isAvailable: p.is_available,
      vendorName: p.vendor_name,
    });
  } catch (err) { next(err); }
});

module.exports = { main: router, statusRouter };
