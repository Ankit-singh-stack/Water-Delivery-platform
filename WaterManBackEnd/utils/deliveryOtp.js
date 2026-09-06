const bcrypt = require("bcrypt");
const { randomInt } = require("crypto");
const pool = require("../db/pool");
const { notifyUser } = require("./socketManager");
const { notify } = require("../services/notification");
const T         = require("../templates/notifications");

/**
 * Generate a 4-6 digit delivery-confirmation OTP for an order, store it hashed
 * (never plaintext), and push it to the customer via a real-time notification.
 *
 * In non-production environments the plaintext OTP is returned so the flow can
 * be tested without a working SMS/notification route.
 */
async function createDeliveryOtp(orderId, userId, digits = 6) {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits);
  const otp = String(randomInt(min, max));
  const codeHash = await bcrypt.hash(otp, 12);

  // Invalidate any previous unused OTPs for this order.
  await pool.query(
    `UPDATE delivery_otps SET used = TRUE
     WHERE order_id = $1 AND used = FALSE`,
    [orderId]
  );

  await pool.query(
    `INSERT INTO delivery_otps (order_id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [orderId, userId, codeHash, new Date(Date.now() + 15 * 60 * 1000)] // 15 min
  );

  const devOtp = process.env.NODE_ENV !== "production" ? otp : undefined;

  await notify(pool, {
    userId,
    template: T.SYSTEM_INFO({
      title: "Delivery Confirmation OTP",
      message: `Your delivery partner will ask for a ${digits}-digit OTP to confirm delivery.${devOtp ? ` (Dev OTP: ${devOtp})` : ''}`,
    }),
    orderId,
  });
  notifyUser(userId, "delivery-otp", { orderId, devOtp });

  return { devOtp };
}

module.exports = { createDeliveryOtp };
