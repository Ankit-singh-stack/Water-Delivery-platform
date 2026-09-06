// Re-exports notifyUser for backwards-compat; new code should import socketManager directly.
const { notifyUser } = require('./socketManager');

function notifyVendorsNewOrder(vendorUserIds, order) {
  for (const uid of vendorUserIds) {
    notifyUser(uid, 'new-order', order);
  }
}

module.exports = { notifyVendorsNewOrder };
