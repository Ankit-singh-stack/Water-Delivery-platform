/**
 * Centralized Notification Service
 *
 * Creates the in-app notification and optionally sends
 * email/SMS notifications to the target user.
 */

const { sendEmail } = require("./email");
const { sendSMS } = require("./sms");

/**
 * Map template category names to DB category names.
 */
const CATEGORY_MAP = {
  order_updates: 'order',
  delivery_updates: 'delivery',
  payment_updates: 'payment',
  promotional: 'promo',
  order: 'order',
  delivery: 'delivery',
  payment: 'payment',
  promo: 'promo',
  system: 'system',
};

function dbCategory(category) {
  return CATEGORY_MAP[category] || category;
}

/**
 * Check if a specific channel is enabled for a category.
 */
function isChannelEnabled(prefs, category, channel) {
  if (!Array.isArray(prefs)) return false;
  const dbCat = dbCategory(category);
  return prefs.some(
    (p) => p.category === dbCat && p.channel === channel && p.enabled === true
  );
}

/**
 * Get or create notification preferences for a user.
 * Returns all preference rows as an array (one row per category+channel).
 */
async function getPreferences(pool, userId) {
  // Seed default prefs for new users (row-per-channel schema)
  const categories = ['order', 'delivery', 'payment', 'promo', 'system'];
  const channels = ['in_app', 'email', 'sms'];
  const defaults = { order: true, delivery: true, payment: true, promo: false, system: true };

  for (const cat of categories) {
    for (const ch of channels) {
      const enabled = ch === 'in_app' ? defaults[cat] : ch === 'email' ? defaults[cat] : false;
      await pool.query(
        `INSERT INTO notification_preferences (user_id, category, channel, enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [userId, cat, ch, enabled]
      );
    }
  }

  const { rows } = await pool.query(
    `SELECT *
     FROM notification_preferences
     WHERE user_id = $1`,
    [userId]
  );

  return rows;
}

/**
 * Send notification to a single user.
 *
 * @param {Pool} pool
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {Object} opts.template
 * @param {string} opts.orderId
 * @param {Object} opts.user
 */
async function notify(pool, {
  userId,
  template,
  orderId,
  user
}) {
  const {
    type,
    category,
    title,
    message
  } = template;

  // ---------------------------------------------------------
  // 1. Create in-app notification
  // ---------------------------------------------------------

  const { rows } = await pool.query(
    `INSERT INTO notifications
      (user_id, type, category, title, message, order_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      type,
      dbCategory(category),
      title,
      message || null,
      orderId || null
    ]
  );

  const notification = rows[0];

  // ---------------------------------------------------------
  // 2. Get notification preferences
  // ---------------------------------------------------------

  let prefs = null;

  try {
    prefs = await getPreferences(pool, userId);
  } catch (error) {
    console.error(
      "[Notification] Could not get preferences:",
      error.message
    );
  }

  // ---------------------------------------------------------
  // 3. Get customer's email and phone from PostgreSQL
  // ---------------------------------------------------------

  let userInfo = user;

  if (!userInfo) {
    const { rows: userRows } = await pool.query(
      `SELECT
         id,
         first_name,
         last_name,
         email,
         phone
       FROM users
       WHERE id = $1`,
      [userId]
    );

    userInfo = userRows[0];
  }

  let emailResult = null;
  let smsResult = null;

  // ---------------------------------------------------------
  // 4. EMAIL
  // ---------------------------------------------------------

  const emailEnabled = isChannelEnabled(prefs, category, 'email');

  if (emailEnabled && userInfo?.email) {

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
      </head>

      <body style="
        margin: 0;
        padding: 0;
        background: #f5f7fa;
        font-family: Arial, sans-serif;
      ">

        <div style="
          max-width: 600px;
          margin: 30px auto;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        ">

          <div style="
            padding: 24px;
            background: #0ea5e9;
            color: white;
          ">
            <h1 style="margin: 0;">
              WaterMan
            </h1>
          </div>

          <div style="padding: 30px;">

            <h2 style="margin-top: 0;">
              ${title}
            </h2>

            <p>
              Hello ${userInfo.first_name || "Customer"},
            </p>

            <p>
              ${message || ""}
            </p>

            ${
              orderId
                ? `
                  <p>
                    <strong>Order ID:</strong>
                    ${orderId}
                  </p>
                `
                : ""
            }

            <p>
              Thank you for choosing WaterMan.
            </p>

          </div>

          <div style="
            padding: 20px;
            text-align: center;
            background: #f1f5f9;
            color: #64748b;
            font-size: 13px;
          ">
            WaterMan Water Delivery
          </div>

        </div>

      </body>
      </html>
    `;

    emailResult = await sendEmail(
      userInfo.email,
      title,
      html
    );

    await logDelivery(
      pool,
      notification.id,
      "email",
      userInfo.email,
      emailResult
    );
  }

  // ---------------------------------------------------------
  // 5. SMS
  // ---------------------------------------------------------

  const smsEnabled = isChannelEnabled(prefs, category, 'sms');

  if (smsEnabled && userInfo?.phone) {

    const smsText =
      `${title}\n${message || ""}`;

    smsResult = await sendSMS(
      userInfo.phone,
      smsText
    );

    await logDelivery(
      pool,
      notification.id,
      "sms",
      userInfo.phone,
      smsResult
    );
  }

  // ---------------------------------------------------------
  // 6. Real-time Socket.IO notification
  // ---------------------------------------------------------

  try {
    const {
      notifyUser
    } = require("../utils/socketManager");

    notifyUser(
      userId,
      "notification",
      {
        id: notification.id,
        type: notification.type,
        category: notification.category,
        title: notification.title,
        message: notification.message,
        orderId: notification.order_id,
        createdAt: notification.created_at,
      }
    );

  } catch (_) {
    // Socket notification is optional.
  }

  return {
    notification,
    emailResult,
    smsResult
  };
}

/**
 * Log email/SMS delivery attempt.
 */
async function logDelivery(
  pool,
  notificationId,
  channel,
  recipient,
  result
) {
  try {

    const status =
      result?.success
        ? "delivered"
        : "failed";

    await pool.query(
      `INSERT INTO notification_deliveries
       (
         notification_id,
         channel,
         recipient,
         status,
         error,
         retry_count,
         provider,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 1, $6, NOW())`,
      [
        notificationId,
        channel,
        recipient,
        status,
        result?.error || null,
        result?.provider || 'smtp'
      ]
    );

  } catch (error) {

    console.error(
      "[Notification] Failed to log delivery:",
      error.message
    );
  }
}

/**
 * Notify multiple users.
 */
async function notifyMany(
  pool,
  userIds,
  {
    template,
    orderId,
    user
  }
) {

  const results =
    await Promise.allSettled(
      userIds.map((userId) =>
        notify(pool, {
          userId,
          template,
          orderId,
          user
        })
      )
    );

  return results;
}

module.exports = {
  notify,
  notifyMany,
  getPreferences
};