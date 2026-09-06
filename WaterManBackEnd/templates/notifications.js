/**
 * Notification templates — reusable, parameterized messages for each event.
 *
 * Each template returns { type, title, message, category }.
 *   type:      notification type column (order, delivery, system, promo)
 *   category:  preference key used to check user notification preferences
 *              (order_updates, payment_updates, delivery_updates, promotional, system)
 */

const T = {
  // ── Customer Order Events ─────────────────────────────────────────────────
  ORDER_PLACED: (order) => ({
    type: "order",
    category: "order_updates",
    title: "Order Placed Successfully",
    message: `Your order #${order.orderNumber} has been placed successfully.`,
  }),

  ORDER_CANCELLED: (order) => ({
    type: "order",
    category: "order_updates",
    title: `Order #${order.orderNumber} Cancelled`,
    message: "Your order has been cancelled successfully.",
  }),

  // ── Vendor Events ─────────────────────────────────────────────────────────
  VENDOR_NEW_ORDER: (order) => ({
    type: "order",
    category: "order_updates",
    title: `New Order in ${order.deliveryCity}`,
    message: `${order.scheduledNote || "ASAP delivery requested"} — ${order.deliveryAreaName}, ${order.deliveryCity}. Order #${order.orderNumber}`,
  }),

  VENDOR_ORDER_ACCEPTED: (order) => ({
    type: "order",
    category: "order_updates",
    title: `Order #${order.orderNumber} Accepted`,
    message: `${order.vendorName || "A vendor"} has accepted your order and will deliver to ${order.deliveryAreaName}, ${order.deliveryCity}.`,
  }),

  VENDOR_ORDER_REJECTED: (order) => ({
    type: "order",
    category: "order_updates",
    title: `Order #${order.orderNumber} Rejected`,
    message: "Unfortunately your order could not be fulfilled. Please place a new order.",
  }),

  // ── Delivery Events ───────────────────────────────────────────────────────
  ORDER_PREPARING: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} — Preparing Delivery`,
    message: `Your order #${order.orderNumber} is being prepared for delivery in ${order.deliveryCity}.`,
  }),

  ORDER_READY_FOR_PICKUP: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} — Ready for Pickup`,
    message: `Your order #${order.orderNumber} is ready for pickup by the delivery partner.`,
  }),

  DELIVERY_ASSIGNED: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: "New Delivery Request",
    message: `Order #${order.orderNumber} is ready for pickup. Please accept the delivery request.`,
  }),

  DELIVERY_PARTNER_ACCEPTED: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} — Delivery Accepted`,
    message: `A delivery partner has accepted the delivery for order #${order.orderNumber}.`,
  }),

  CUSTOMER_DELIVERY_ASSIGNED: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: "Delivery Partner Assigned",
    message: `A delivery partner is heading to pick up your order #${order.orderNumber}.`,
  }),
  ORDER_OUT_FOR_DELIVERY: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} — Out for Delivery`,
    message: `Your order #${order.orderNumber} is out for delivery.`,
  }),

  ORDER_DELIVERED: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} Delivered`,
    message: `Your water has been delivered. Thank you for using WaterMan!`,
  }),

  ORDER_DELIVERED_VENDOR: (order) => ({
    type: "delivery",
    category: "delivery_updates",
    title: `Order #${order.orderNumber} Delivered`,
    message: `Order #${order.orderNumber} has been delivered by your delivery partner.`,
  }),

  // ── Payment Events ────────────────────────────────────────────────────────
  PAYMENT_SUCCESS: (order) => ({
    type: "order",
    category: "payment_updates",
    title: `Payment Successful — Order #${order.orderNumber}`,
    message: `Payment of ₹${order.amount || "N/A"} received for order #${order.orderNumber}.`,
  }),

  PAYMENT_FAILED: (order) => ({
    type: "order",
    category: "payment_updates",
    title: `Payment Failed — Order #${order.orderNumber}`,
    message: `Payment for order #${order.orderNumber} failed. Please try again.`,
  }),

  // ── System Events ─────────────────────────────────────────────────────────
  SYSTEM_INFO: (data) => ({
    type: "system",
    category: "system",
    title: data.title || "System Notification",
    message: data.message || "",
  }),

  // ── Delivery partner approved by a vendor ─────────────────────────────────
  PARTNER_APPROVED: (data) => ({
    type: "system",
    category: "delivery_updates",
    title: "Account Approved",
    message: `Congratulations! ${data.vendorName} has approved your delivery partner account. You can now go online to accept deliveries.`,
  }),
};

module.exports = T;
