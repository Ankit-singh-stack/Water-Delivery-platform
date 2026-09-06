const router = require("express").Router();
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const pool = require("../db/pool");
const { generateOtp, otpExpiresAt } = require("../utils/otp");
const { isOtpEnabled } = require("../utils/otpConfig");

// 10 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// 5 OTP attempts per IP per 10 minutes
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// 3 resend-OTP requests per IP per 10 minutes (SMS-bomb protection)
const resendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

// Create a session for a user and return { token, user } in the client-facing shape.
async function createSessionForUser(userId) {
  const token = uuidv4();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await pool.query(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expires],
  );

  const { rows } = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, r.name AS role_name
     FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId],
  );
  const u = rows[0];
  return {
    token,
    user: {
      id:        u.id,
      firstName: u.first_name,
      lastName:  u.last_name,
      email:     u.email,
      phone:     u.phone,
      role:      u.role_name ?? 'user',
    },
  };
}

// ─── POST /auth/signup ────────────────────────────────────────────────────────
router.post("/signup", async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    if (!firstName || !lastName || !phone || !password)
      return res.status(400).json({ error: "required_fields" });

    // Email uniqueness (optional field)
    if (email) {
      const { rows: emailRows } = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email.toLowerCase()],
      );
      if (emailRows.length)
        return res.status(409).json({ error: "email_exists" });
    }

    // Phone uniqueness
    const { rows: phoneRows } = await pool.query(
      "SELECT id, phone_verified FROM users WHERE phone = $1",
      [phone],
    );
    if (phoneRows.length) {
      if (phoneRows[0].phone_verified)
        return res.status(409).json({ error: "phone_exists" });
      // Unverified duplicate — delete and re-register
      await pool.query("DELETE FROM users WHERE id = $1", [phoneRows[0].id]);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otpRequired = isOtpEnabled();

    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, phone_verified, role_id)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM roles WHERE name = 'user')) RETURNING id`,
      [
        firstName,
        lastName,
        email ? email.toLowerCase() : null,
        phone,
        passwordHash,
        !otpRequired,
      ],
    );
    const userId = rows[0].id;

    // OTP disabled — account is auto-approved, sign the user in immediately
    if (!otpRequired) {
      const { token, user } = await createSessionForUser(userId);
      return res.status(201).json({ userId, phone, token, user });
    }

    // Create OTP
    const otp = generateOtp();
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'verify_phone', $3)`,
      [userId, otp, otpExpiresAt()],
    );

    // TODO: send OTP via SMS
    res.status(201).json({
      userId,
      phone,
      ...(process.env.NODE_ENV !== "production" && { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
router.post("/verify-otp", otpLimiter, async (req, res, next) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code)
      return res.status(400).json({ error: "required_fields" });

    const { rows } = await pool.query(
      `SELECT id FROM otp_codes
        WHERE user_id = $1 AND code = $2 AND purpose = 'verify_phone'
          AND used = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [userId, code],
    );
    if (!rows.length) return res.status(400).json({ error: "otp_invalid" });

    // Mark OTP used + verify phone
    await pool.query("UPDATE otp_codes SET used = TRUE WHERE id = $1", [
      rows[0].id,
    ]);
    await pool.query("UPDATE users SET phone_verified = TRUE WHERE id = $1", [
      userId,
    ]);

    const { token, user } = await createSessionForUser(userId);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/resend-otp ────────────────────────────────────────────────────
router.post("/resend-otp", resendLimiter, async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "required_fields" });

    const { rows } = await pool.query(
      "SELECT id, phone_verified FROM users WHERE id = $1",
      [userId],
    );
    if (!rows.length) return res.status(404).json({ error: "user_not_found" });
    if (rows[0].phone_verified)
      return res.status(400).json({ error: "already_verified" });

    // Invalidate old OTPs
    await pool.query(
      `UPDATE otp_codes SET used = TRUE
        WHERE user_id = $1 AND purpose = 'verify_phone' AND used = FALSE`,
      [userId],
    );

    const otp = generateOtp();
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'verify_phone', $3)`,
      [userId, otp, otpExpiresAt()],
    );

    // TODO: send OTP via SMS
    res.json({
      message: "OTP resent",
      ...(process.env.NODE_ENV !== "production" && { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: "required_fields" });

    const isEmail = identifier.includes("@");
    const { rows } = await pool.query(
      isEmail
        ? `SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.email = $1`
        : `SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.phone = $1`,
      [isEmail ? identifier.toLowerCase() : identifier],
    );

    if (!rows.length)
      return res.status(401).json({ error: "invalid_credentials" });
    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "invalid_credentials" });

    if (isOtpEnabled() && !user.phone_verified) {
      const otp = generateOtp();
      await pool.query(
        `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
         VALUES ($1, $2, 'verify_phone', $3)`,
        [user.id, otp, otpExpiresAt()],
      );
      return res.status(403).json({
        error: "unverified",
        userId: user.id,
        phone: user.phone,
        ...(process.env.NODE_ENV !== "production" && { devOtp: otp }),
      });
    }

    const { token, user: sessionUser } = await createSessionForUser(user.id);
    res.json({ token, user: sessionUser });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", async (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (token)
      await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: "required_fields" });

    const isEmail = identifier.includes("@");
    const { rows } = await pool.query(
      isEmail
        ? "SELECT id, email, phone FROM users WHERE email = $1"
        : "SELECT id, email, phone FROM users WHERE phone = $1",
      [isEmail ? identifier.toLowerCase() : identifier],
    );

    // Always return 200 to prevent user enumeration
    if (!rows.length) return res.json({ message: "reset_sent" });

    const user = rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expires],
    );

    // TODO: send reset email/SMS
    res.json({
      message: "reset_sent",
      ...(process.env.NODE_ENV !== "production" && { devToken: token }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/vendor-register ───────────────────────────────────────────────
router.post("/vendor-register", async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, phone, password,
      companyName, streetName, areaName, cityId, stateId, pincode,
    } = req.body;

    if (!firstName || !lastName || !phone || !password || !companyName || !streetName || !areaName || !stateId || !pincode)
      return res.status(400).json({ error: "required_fields" });

    // Validate state exists
    const { rows: stateRows } = await pool.query(
      "SELECT id FROM states WHERE id = $1 AND is_active = TRUE", [stateId]
    );
    if (!stateRows.length) return res.status(400).json({ error: "invalid_state" });

    // Validate city belongs to state (if provided)
    if (cityId) {
      const { rows: cityRows } = await pool.query(
        "SELECT id FROM cities WHERE id = $1 AND state_id = $2 AND is_active = TRUE",
        [cityId, stateId]
      );
      if (!cityRows.length) return res.status(400).json({ error: "invalid_city" });
    }

    // Email uniqueness
    if (email) {
      const { rows: emailRows } = await pool.query(
        "SELECT id FROM users WHERE email = $1", [email.toLowerCase()]
      );
      if (emailRows.length) return res.status(409).json({ error: "email_exists" });
    }

    // Phone uniqueness
    const { rows: phoneRows } = await pool.query(
      "SELECT id, phone_verified FROM users WHERE phone = $1", [phone]
    );
    if (phoneRows.length) {
      if (phoneRows[0].phone_verified)
        return res.status(409).json({ error: "phone_exists" });
      await pool.query("DELETE FROM users WHERE id = $1", [phoneRows[0].id]);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otpRequired = isOtpEnabled();

    // Look up vendor role id
    const { rows: roleRows } = await pool.query(
      "SELECT id FROM roles WHERE name = 'vendor'"
    );
    const roleId = roleRows[0]?.id ?? null;

    // Create user
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role_id, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [firstName, lastName, email ? email.toLowerCase() : null, phone, passwordHash, roleId, !otpRequired]
    );
    const userId = userRows[0].id;

    // Create vendor profile
    await pool.query(
      `INSERT INTO vendor_profiles (user_id, company_name, street_name, area_name, city_id, state_id, pincode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, companyName.trim(), streetName.trim(), areaName.trim(), cityId || null, stateId, pincode.trim()]
    );

    // OTP disabled — account is auto-approved, sign the vendor in immediately
    if (!otpRequired) {
      const { token, user } = await createSessionForUser(userId);
      return res.status(201).json({ userId, phone, token, user });
    }

    // Create OTP
    const otp = generateOtp();
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'verify_phone', $3)`,
      [userId, otp, otpExpiresAt()]
    );

    res.status(201).json({
      userId,
      phone,
      ...(process.env.NODE_ENV !== "production" && { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/delivery-partner-register ─────────────────────────────────────
// Self-service signup for an independent delivery partner. The partner is
// created with status = 'pending' and is not tied to any vendor yet
// (vendor_id is NULL); a vendor must approve/claim them via the vendor partner flow.
router.post("/delivery-partner-register", async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, phone, password,
      vehicleType, vehicleNumber, hasLicense, licenseNumber, serviceArea, cityId,
    } = req.body;

    if (!firstName || !lastName || !phone || !password)
      return res.status(400).json({ error: "required_fields" });

    // Validate the service city (optional, but if provided it must be a real active city).
    // Vendors will only see & approve partners who declared the same city.
    if (cityId) {
      const { rows: cityRows } = await pool.query(
        "SELECT id FROM cities WHERE id = $1 AND is_active = TRUE",
        [cityId]
      );
      if (!cityRows.length) return res.status(400).json({ error: "invalid_city" });
    }

    // Email uniqueness (optional field)
    if (email) {
      const { rows: emailRows } = await pool.query(
        "SELECT id FROM users WHERE email = $1", [email.toLowerCase()]
      );
      if (emailRows.length) return res.status(409).json({ error: "email_exists" });
    }

    // Phone uniqueness
    const { rows: phoneRows } = await pool.query(
      "SELECT id, phone_verified FROM users WHERE phone = $1", [phone]
    );
    if (phoneRows.length) {
      if (phoneRows[0].phone_verified)
        return res.status(409).json({ error: "phone_exists" });
      await pool.query("DELETE FROM users WHERE id = $1", [phoneRows[0].id]);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otpRequired = isOtpEnabled();

    // Look up delivery_partner role id
    const { rows: roleRows } = await pool.query(
      "SELECT id FROM roles WHERE name = 'delivery_partner'"
    );
    const roleId = roleRows[0]?.id;
    if (!roleId) return res.status(500).json({ error: "delivery_role_missing" });

    const { rows: userRows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, phone, password_hash, role_id, phone_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [firstName, lastName, email ? email.toLowerCase() : null, phone, passwordHash, roleId, !otpRequired]
    );
    const userId = userRows[0].id;

    // Create an independent (vendor_id NULL), pending approval delivery profile
    await pool.query(
      `INSERT INTO delivery_partner_profiles
         (user_id, vendor_id, vehicle_type, vehicle_number, has_license, license_number, service_area, city_id, status)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'pending')`,
      [userId, vehicleType || null, vehicleNumber || null, !!hasLicense,
       licenseNumber || null, serviceArea || null, cityId || null]
    );

    // OTP disabled — account is auto-approved, sign the partner in immediately.
    // The frontend then routes to the delivery-partner dashboard.
    if (!otpRequired) {
      const { token, user } = await createSessionForUser(userId);
      return res.status(201).json({ userId, phone, token, user });
    }

    // Create OTP
    const otp = generateOtp();
    await pool.query(
      `INSERT INTO otp_codes (user_id, code, purpose, expires_at)
       VALUES ($1, $2, 'verify_phone', $3)`,
      [userId, otp, otpExpiresAt()]
    );

    res.status(201).json({
      userId,
      phone,
      ...(process.env.NODE_ENV !== "production" && { devOtp: otp }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: "required_fields" });

    const { rows } = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
        WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token],
    );
    if (!rows.length) return res.status(400).json({ error: "token_invalid" });

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      rows[0].user_id,
    ]);
    await pool.query(
      "UPDATE password_reset_tokens SET used = TRUE WHERE id = $1",
      [rows[0].id],
    );

    // Invalidate all existing sessions
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [
      rows[0].user_id,
    ]);

    res.json({ message: "password_reset_success" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
