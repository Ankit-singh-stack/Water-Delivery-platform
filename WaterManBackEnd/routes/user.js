const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { generateOtp, otpExpiresAt } = require("../utils/otp");
const { isOtpEnabled } = require("../utils/otpConfig");
const { notifyUser }            = require("../utils/socketManager");
const { notify, notifyMany }    = require("../services/notification");
const T                         = require("../templates/notifications");
const { createDeliveryOtp }     = require("../utils/deliveryOtp");

function getRazorpay() {
  const Razorpay = require("razorpay");
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

const router = express.Router();
router.use(requireAuth);

// ── Profile ────────────────────────────────────────────────────────────────────

router.get("/profile", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone, phone_verified, created_at
       FROM users WHERE id = $1`,
      [req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/profile/request-update", async (req, res, next) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    if (!isOtpEnabled()) {
      return res.json({ message: "otp_not_required", otpRequired: false, phone: req.user.phone });
    }

    const code = generateOtp();
    const expires = otpExpiresAt();

    await pool.query(
      `UPDATE otp_codes SET used = TRUE
       WHERE user_id = $1 AND purpose = 'update_profile' AND used = FALSE`,
      [req.user.user_id],
    );
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'update_profile', $3)`,
      [req.user.user_id, code, expires],
    );

    const devOtp = process.env.NODE_ENV !== "production" ? code : undefined;
    res.json({ message: "otp_sent", otpRequired: true, phone: req.user.phone, devOtp });
  } catch (err) {
    next(err);
  }
});

router.post("/profile/confirm-update", async (req, res, next) => {
  try {
    const { firstName, lastName, email, otp } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    if (isOtpEnabled()) {
      if (!otp) return res.status(400).json({ error: "required_fields_missing" });

      const { rows } = await pool.query(
        `SELECT id FROM otp_codes
         WHERE user_id = $1 AND purpose = 'update_profile'
           AND used = FALSE AND expires_at > NOW() AND code = $2
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.user_id, otp],
      );
      if (!rows[0]) return res.status(400).json({ error: "otp_invalid" });

      await pool.query("UPDATE otp_codes SET used = TRUE WHERE id = $1", [
        rows[0].id,
      ]);
    }

    if (email && email !== req.user.email) {
      const { rows: dup } = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.user.user_id],
      );
      if (dup[0]) return res.status(409).json({ error: "email_exists" });
    }

    const { rows: updated } = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, email = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, first_name, last_name, email, phone, phone_verified, created_at`,
      [
        firstName.trim(),
        lastName.trim(),
        email?.trim() || null,
        req.user.user_id,
      ],
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

// ── Addresses ──────────────────────────────────────────────────────────────────

router.get("/addresses", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM addresses WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.user_id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/addresses", async (req, res, next) => {
  try {
    const {
      doorNo,
      plotNo,
      buildingName,
      streetName,
      areaName,
      city,
      state,
      country,
      isDefault,
      label,
    } = req.body;
    if (
      !streetName?.trim() ||
      !areaName?.trim() ||
      !city?.trim() ||
      !state?.trim()
    ) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    if (isDefault) {
      await pool.query(
        "UPDATE addresses SET is_default = FALSE WHERE user_id = $1",
        [req.user.user_id],
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO addresses
         (user_id, label, door_no, plot_no, building_name, street_name, area_name, city, state, country, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        req.user.user_id,
        label?.trim() || null,
        doorNo?.trim() || null,
        plotNo?.trim() || null,
        buildingName?.trim() || null,
        streetName.trim(),
        areaName.trim(),
        city.trim(),
        state.trim(),
        country?.trim() || "India",
        !!isDefault,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/addresses/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      doorNo,
      plotNo,
      buildingName,
      streetName,
      areaName,
      city,
      state,
      country,
      isDefault,
      label,
    } = req.body;
    if (
      !streetName?.trim() ||
      !areaName?.trim() ||
      !city?.trim() ||
      !state?.trim()
    ) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    const { rows: existing } = await pool.query(
      "SELECT id FROM addresses WHERE id = $1 AND user_id = $2",
      [id, req.user.user_id],
    );
    if (!existing[0]) return res.status(404).json({ error: "not_found" });

    if (isDefault) {
      await pool.query(
        "UPDATE addresses SET is_default = FALSE WHERE user_id = $1",
        [req.user.user_id],
      );
    }

    const { rows } = await pool.query(
      `UPDATE addresses
       SET label = $1, door_no = $2, plot_no = $3, building_name = $4,
           street_name = $5, area_name = $6, city = $7, state = $8,
           country = $9, is_default = $10, updated_at = NOW()
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [
        label?.trim() || null,
        doorNo?.trim() || null,
        plotNo?.trim() || null,
        buildingName?.trim() || null,
        streetName.trim(),
        areaName.trim(),
        city.trim(),
        state.trim(),
        country?.trim() || "India",
        !!isDefault,
        id,
        req.user.user_id,
      ],
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/addresses/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM addresses WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.user_id],
    );
    if (!rowCount) return res.status(404).json({ error: "not_found" });
    res.json({ message: "deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Orders ─────────────────────────────────────────────────────────────────────

router.get("/orders/summary", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT status, COUNT(*)::int AS count FROM orders WHERE user_id = $1 GROUP BY status",
      [req.user.user_id],
    );
    const summary = { active: 0, delivered: 0, failed: 0, rejected: 0, cancelled: 0, total: 0 };
    for (const row of rows) {
      summary.total += row.count;
      if (["draft", "confirmed", "accepted", "preparing", "in_transit"].includes(row.status))
        summary.active += row.count;
      else if (row.status === "delivered")  summary.delivered  += row.count;
      else if (row.status === "failed")     summary.failed     += row.count;
      else if (row.status === "rejected")   summary.rejected   += row.count;
      else if (row.status === "cancelled")  summary.cancelled  += row.count;
    }
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT o.*,
                tt.name          AS tanker_type_name,
                tt.capacity_litres,
                tt.image_url     AS tanker_image_url,
                vp.company_name  AS vendor_company,
                vp.area_name     AS vendor_area,
                vc.name          AS vendor_city,
                uv.phone         AS vendor_phone,
                uv.first_name || ' ' || uv.last_name AS vendor_contact,
                dp.id            AS delivery_partner_id,
                dp.latitude      AS delivery_partner_latitude,
                dp.longitude     AS delivery_partner_longitude,
                du.first_name || ' ' || du.last_name AS delivery_partner_name,
                du.phone         AS delivery_partner_phone,
                du.email         AS delivery_partner_email
         FROM   orders o
         LEFT JOIN tanker_types    tt ON tt.id = o.tanker_type_id
         LEFT JOIN vendor_profiles vp ON vp.id = o.vendor_id
         LEFT JOIN cities          vc ON vc.id = vp.city_id
         LEFT JOIN users           uv ON uv.id = vp.user_id
         LEFT JOIN delivery_partner_profiles dp ON dp.id = o.delivery_partner_id
         LEFT JOIN users           du ON du.id = dp.user_id
         WHERE  o.user_id = $1
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.user_id, limit, offset],
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM orders WHERE user_id = $1', [req.user.user_id]),
    ]);
    res.json({ data: rows, total: countRows[0].total, page, pageSize: limit });
  } catch (err) {
    next(err);
  }
});

// GET /user/orders/vendors?city= — active vendors in a city
router.get("/orders/vendors", async (req, res, next) => {
  try {
    const { city } = req.query;
    if (!city) return res.status(400).json({ error: "city_required" });

    const { rows } = await pool.query(
      `SELECT vp.id, vp.company_name, vp.area_name, vp.pincode,
              c.name AS city_name, s.name AS state_name
       FROM   vendor_profiles vp
       JOIN   users  u ON u.id  = vp.user_id
       JOIN   cities c ON c.id  = vp.city_id
       JOIN   states s ON s.id  = vp.state_id
       WHERE  vp.is_active = TRUE
         AND  u.role_id = (SELECT id FROM roles WHERE name = 'vendor')
         AND  c.name ILIKE $1
       ORDER  BY vp.company_name`,
      [city],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /user/orders — place a new order, then notify all vendors in that city
router.post("/orders", async (req, res, next) => {
  try {
    const {
      scheduledAt,
      deliveryDoorNo,
      deliveryPlotNo,
      deliveryBuildingName,
      deliveryStreetName,
      deliveryAreaName,
      deliveryCity,
      deliveryState,
      deliveryPincode,
      siteType,
      siteSubType,
      timeSlab,
      tankerTypeId,
      quantity = 1,
    } = req.body;

    if (
      !deliveryStreetName ||
      !deliveryAreaName ||
      !deliveryCity ||
      !deliveryState ||
      !deliveryPincode
    )
      return res.status(400).json({ error: "required_fields" });

    // Validate scheduledAt is at least 30 minutes in the future
    if (scheduledAt) {
      const scheduled = new Date(scheduledAt);
      if (isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + 30 * 60 * 1000) {
        return res.status(400).json({ error: "scheduled_at_must_be_future" });
      }
    }

    // Validate deliveryCity against known active cities to prevent wildcard abuse
    const { rows: cityCheck } = await pool.query(
      "SELECT name FROM cities WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1",
      [deliveryCity]
    );
    if (!cityCheck.length) return res.status(400).json({ error: "invalid_delivery_city" });
    const canonicalCity = cityCheck[0].name;

    // Resolve tanker type and price (optional for backward compat)
    let resolvedTankerTypeId = null;
    let unitPrice = null;
    let totalPrice = null;

    if (tankerTypeId) {
      const { rows: ttRows } = await pool.query(
        "SELECT id, base_price FROM tanker_types WHERE id = $1 AND is_active = TRUE",
        [tankerTypeId]
      );
      if (!ttRows.length) return res.status(400).json({ error: "invalid_tanker_type" });
      resolvedTankerTypeId = ttRows[0].id;
      unitPrice = parseFloat(ttRows[0].base_price);
      totalPrice = unitPrice * Math.max(1, parseInt(quantity) || 1);
    }

    // Use timestamp + random hex to guarantee uniqueness under concurrent load
    const crypto = require("crypto");
    const orderNumber = `WM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const { rows } = await pool.query(
      `INSERT INTO orders (
         user_id, order_number, status,
         delivery_door_no, delivery_plot_no, delivery_building_name,
         delivery_street_name, delivery_area_name, delivery_city, delivery_state, delivery_country,
         delivery_pincode, site_type, site_sub_type, time_slab,
         scheduled_at, tanker_type_id, quantity, unit_price, total_price
       ) VALUES ($1,$2,'confirmed',$3,$4,$5,$6,$7,$8,$9,'India',$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, order_number, status, scheduled_at, created_at, tanker_type_id, quantity, unit_price, total_price`,
      [
        req.user.user_id,
        orderNumber,
        deliveryDoorNo || null,
        deliveryPlotNo || null,
        deliveryBuildingName || null,
        deliveryStreetName,
        deliveryAreaName,
        canonicalCity,
        deliveryState,
        deliveryPincode || null,
        siteType || null,
        siteSubType || null,
        timeSlab || null,
        scheduledAt || null,
        resolvedTankerTypeId,
        Math.max(1, parseInt(quantity) || 1),
        unitPrice,
        totalPrice,
      ],
    );

    // Notify all active online vendors in the delivery city (canonical name, exact match)
    const { rows: vendors } = await pool.query(
      `SELECT vp.user_id
       FROM   vendor_profiles vp
       JOIN   cities c ON c.id = vp.city_id
       WHERE  c.name = $1 AND vp.is_active = TRUE AND vp.is_online = TRUE`,
      [canonicalCity],
    );

    if (vendors.length) {
      const scheduledNote = scheduledAt
        ? `Scheduled for ${new Date(scheduledAt).toLocaleString("en-IN")}`
        : "ASAP delivery requested";

      const orderPayload = {
        orderNumber, deliveryCity, deliveryAreaName, scheduledAt,
        createdAt: rows[0]?.created_at,
      };

      await Promise.all(
        vendors.map((v) => {
          console.log(`[Notification] New order recipient userId: ${v.user_id}`);
          return notify(pool, {
            userId: v.user_id,
            template: T.VENDOR_NEW_ORDER({ orderNumber, deliveryCity, deliveryAreaName, scheduledNote }),
            orderId: rows[0]?.id,
          }).then(() => notifyUser(v.user_id, 'new-order', orderPayload));
        }),
      );
    }

    // Notify customer of successful order placement
    await notify(pool, {
      userId: req.user.user_id,
      template: T.ORDER_PLACED({ orderNumber }),
      orderId: rows[0]?.id,
    });

    // Generate the delivery-confirmation OTP right away so the customer can
    // share it with the delivery partner to complete delivery. The customer is
    // notified with the code (in-app; SMS when a provider is wired up).
    const { devOtp } = await createDeliveryOtp(rows[0].id, req.user.user_id);

    res.status(201).json({ ...rows[0], ...(devOtp ? { devOtp } : {}) });
  } catch (err) {
    next(err);
  }
});
router.patch("/orders/:id/cancel", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'confirmed'
       RETURNING *`,
      [req.params.id, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_cancellable" });
    const order = rows[0];

    // Notify the customer
    await notify(pool, {
      userId: req.user.user_id,
      template: T.ORDER_CANCELLED({ orderNumber: order.order_number }),
      orderId: order.id,
    });

    res.json(order);
  } catch (err) { next(err); }
});

// GET /user/orders/:id — single order with vendor details (must be after specific routes)
router.get("/orders/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*,
              tt.name          AS tanker_type_name,
              tt.capacity_litres,
              tt.image_url     AS tanker_image_url,
              vp.company_name  AS vendor_company,
              vp.area_name     AS vendor_area,
              vc.name          AS vendor_city,
              uv.phone         AS vendor_phone,
              uv.first_name || ' ' || uv.last_name AS vendor_contact,
              dp.id            AS delivery_partner_id,
              dp.latitude      AS delivery_partner_latitude,
              dp.longitude     AS delivery_partner_longitude,
              du.first_name || ' ' || du.last_name AS delivery_partner_name,
              du.phone         AS delivery_partner_phone,
              du.email         AS delivery_partner_email
       FROM   orders o
       LEFT JOIN tanker_types    tt ON tt.id = o.tanker_type_id
       LEFT JOIN vendor_profiles vp ON vp.id = o.vendor_id
       LEFT JOIN cities vc ON vc.id = vp.city_id
       LEFT JOIN users  uv ON uv.id = vp.user_id
       LEFT JOIN delivery_partner_profiles dp ON dp.id = o.delivery_partner_id
       LEFT JOIN users           du ON du.id = dp.user_id
       WHERE  o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Ratings ────────────────────────────────────────────────────────────────────

router.post("/orders/:id/rate", async (req, res, next) => {
  try {
    const { rating, review } = req.body;
    const r = parseInt(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: "rating_1_to_5" });

    const { rows: orderRows } = await pool.query(
      "SELECT id, vendor_id, status FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.user_id]
    );
    if (!orderRows[0]) return res.status(404).json({ error: "order_not_found" });
    if (orderRows[0].status !== "delivered") return res.status(400).json({ error: "not_delivered" });

    const { rows } = await pool.query(
      `INSERT INTO order_ratings (order_id, user_id, vendor_id, rating, review)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO UPDATE SET rating = $4, review = $5
       RETURNING id, rating, review, created_at`,
      [req.params.id, req.user.user_id, orderRows[0].vendor_id, r, review?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── Payment ────────────────────────────────────────────────────────────────────

// POST /user/orders/:id/payment/initiate — create Razorpay order
router.post("/orders/:id/payment/initiate", async (req, res, next) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: "payment_not_configured" });
    }

    const { rows } = await pool.query(
      "SELECT id, status, total_price, payment_status, razorpay_order_id FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_found" });

    const order = rows[0];
    if (order.payment_status === "paid") return res.status(400).json({ error: "already_paid" });
    if (!['confirmed', 'accepted', 'preparing', 'in_transit'].includes(order.status)) {
      return res.status(400).json({ error: "order_not_payable" });
    }
    if (!order.total_price) return res.status(400).json({ error: "no_price_on_order" });

    // Return existing Razorpay order if payment still pending (prevents double-charge)
    if (order.razorpay_order_id) {
      try {
        const razorpay = getRazorpay();
        const existing = await razorpay.orders.fetch(order.razorpay_order_id);
        if (existing.status === 'created') {
          return res.json({
            razorpayOrderId: existing.id,
            amount:          existing.amount,
            currency:        existing.currency,
            keyId:           process.env.RAZORPAY_KEY_ID,
          });
        }
      } catch (_) { /* stale order — create a new one */ }
    }

    const razorpay = getRazorpay();
    const rOrder = await razorpay.orders.create({
      amount:   Math.round(parseFloat(order.total_price) * 100),
      currency: "INR",
      receipt:  order.id.slice(0, 30),
    });

    await pool.query(
      "UPDATE orders SET razorpay_order_id = $1, updated_at = NOW() WHERE id = $2",
      [rOrder.id, order.id]
    );

    res.json({
      razorpayOrderId: rOrder.id,
      amount:          rOrder.amount,
      currency:        rOrder.currency,
      keyId:           process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) { next(err); }
});

// POST /user/orders/:id/payment/verify — verify HMAC signature and mark paid
router.post("/orders/:id/payment/verify", async (req, res, next) => {
  try {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({ error: "required_fields" });
    }

    const { rows } = await pool.query(
      "SELECT id, order_number, total_price, razorpay_order_id FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_found" });
    if (rows[0].razorpay_order_id !== razorpayOrderId) {
      return res.status(400).json({ error: "order_id_mismatch" });
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ error: "invalid_signature" });
    }

    const { rows: updated } = await pool.query(
      `UPDATE orders
       SET payment_status = 'paid', payment_method = 'razorpay',
           payment_reference = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, payment_status, payment_method, payment_reference`,
      [razorpayPaymentId, req.params.id]
    );

    // Notify customer of successful payment
    await notify(pool, {
      userId: req.user.user_id,
      template: T.PAYMENT_SUCCESS({ orderNumber: rows[0].order_number, amount: rows[0].total_price }),
      orderId: rows[0].id,
    });

    res.json(updated[0]);
  } catch (err) { next(err); }
});

// POST /user/orders/:id/payment/cod — mark order as Cash on Delivery
router.post("/orders/:id/payment/cod", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, payment_status FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.user_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "order_not_found" });
    if (rows[0].payment_status === "paid") return res.status(400).json({ error: "already_paid" });

    const { rows: updated } = await pool.query(
      `UPDATE orders SET payment_status = 'cod', payment_method = 'cod', updated_at = NOW()
       WHERE id = $1
       RETURNING id, payment_status, payment_method`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// ── Vendor Profile ────────────────────────────────────────────────────────────

router.get("/vendor-profile", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT vp.id, vp.company_name, vp.street_name, vp.area_name,
              vp.pincode, vp.is_active,
              c.id AS city_id, c.name AS city_name,
              s.id AS state_id, s.name AS state_name, s.state_code
       FROM vendor_profiles vp
       LEFT JOIN cities c ON c.id = vp.city_id
       JOIN states s ON s.id = vp.state_id
       WHERE vp.user_id = $1`,
      [req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_a_vendor" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/vendor-profile", async (req, res, next) => {
  try {
    const { companyName, streetName, areaName, cityId, pincode } = req.body;
    if (!companyName?.trim() || !streetName?.trim() || !areaName?.trim() || !cityId || !pincode?.trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }

    const { rows: cityRows } = await pool.query(
      "SELECT id, state_id FROM cities WHERE id = $1 AND is_active = TRUE",
      [cityId],
    );
    if (!cityRows[0]) return res.status(400).json({ error: "invalid_city" });

    const { rows } = await pool.query(
      `UPDATE vendor_profiles
       SET company_name = $1, street_name = $2, area_name = $3,
           city_id = $4, state_id = $5, pincode = $6, updated_at = NOW()
       WHERE user_id = $7
       RETURNING id`,
      [companyName.trim(), streetName.trim(), areaName.trim(), cityId, cityRows[0].state_id, pincode.trim(), req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_a_vendor" });

    const { rows: updated } = await pool.query(
      `SELECT vp.id, vp.company_name, vp.street_name, vp.area_name,
              vp.pincode, vp.is_active,
              c.id AS city_id, c.name AS city_name,
              s.id AS state_id, s.name AS state_name, s.state_code
       FROM vendor_profiles vp
       JOIN cities c ON c.id = vp.city_id
       JOIN states s ON s.id = vp.state_id
       WHERE vp.user_id = $1`,
      [req.user.user_id],
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

// ── Change Password ────────────────────────────────────────────────────────────

router.post("/change-password/request", async (req, res, next) => {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword)
      return res.status(400).json({ error: "current_password_required" });

    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid)
      return res.status(401).json({ error: "invalid_current_password" });

    if (!isOtpEnabled()) {
      return res.json({ message: "otp_not_required", otpRequired: false, phone: req.user.phone });
    }

    const code = generateOtp();
    const expires = otpExpiresAt();

    await pool.query(
      `UPDATE otp_codes SET used = TRUE
       WHERE user_id = $1 AND purpose = 'change_password' AND used = FALSE`,
      [req.user.user_id],
    );
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'change_password', $3)`,
      [req.user.user_id, code, expires],
    );

    const devOtp = process.env.NODE_ENV !== "production" ? code : undefined;
    res.json({ message: "otp_sent", otpRequired: true, phone: req.user.phone, devOtp });
  } catch (err) {
    next(err);
  }
});

router.post("/change-password/confirm", async (req, res, next) => {
  try {
    const { newPassword, otp } = req.body;
    if (!newPassword)
      return res.status(400).json({ error: "required_fields_missing" });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "weak_password" });

    if (isOtpEnabled()) {
      if (!otp) return res.status(400).json({ error: "required_fields_missing" });

      const { rows } = await pool.query(
        `SELECT id FROM otp_codes
         WHERE user_id = $1 AND purpose = 'change_password'
           AND used = FALSE AND expires_at > NOW() AND code = $2
         ORDER BY created_at DESC LIMIT 1`,
        [req.user.user_id, otp],
      );
      if (!rows[0]) return res.status(400).json({ error: "otp_invalid" });

      await pool.query("UPDATE otp_codes SET used = TRUE WHERE id = $1", [
        rows[0].id,
      ]);
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [hash, req.user.user_id],
    );

    // Invalidate all other sessions (keep current)
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    await pool.query(
      "DELETE FROM sessions WHERE user_id = $1 AND token != $2",
      [req.user.user_id, token],
    );

    res.json({ message: "password_changed" });
  } catch (err) {
    next(err);
  }
});

// ── Notifications ──────────────────────────────────────────────────────────────

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
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.user_id],
    );
    res.json({ message: "all_read" });
  } catch (err) {
    next(err);
  }
});

// ── Support Tickets ────────────────────────────────────────────────────────────

router.post("/support/ticket", async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    const { rows } = await pool.query(
      `INSERT INTO support_tickets (user_id, subject, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.user_id, subject.trim(), message.trim()],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/support/tickets", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, subject, status, created_at FROM support_tickets
       WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.user_id],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Notification Preferences ────────────────────────────────────────────────

router.get("/notification-preferences", async (req, res, next) => {
  try {
    // Upsert default prefs if none exist
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

module.exports = router;
