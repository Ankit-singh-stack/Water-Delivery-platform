const pool = require('../db/pool');

const userSockets = new Map(); // userId -> Set<socket>

async function authenticateSocket(socket) {
  const token = socket.handshake.auth?.token;
  if (!token) return null;
  try {
    const { rows } = await pool.query(
      `SELECT s.user_id FROM sessions s
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    return rows[0]?.user_id ?? null;
  } catch { return null; }
}

function initSocketManager(io) {
  io.on('connection', async (socket) => {
    const userId = await authenticateSocket(socket);
    if (!userId) { socket.disconnect(); return; }

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket);

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) userSockets.delete(userId);
      }
    });
  });
}

function notifyUser(userId, event, data) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const sock of sockets) sock.emit(event, data);
  }
}

module.exports = { initSocketManager, notifyUser };
