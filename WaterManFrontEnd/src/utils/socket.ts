import { io, Socket } from 'socket.io-client';

const BASE = import.meta.env.SITE_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function connectSocket(token?: string): Socket {
  const authToken = token ?? localStorage.getItem('wm_token') ?? null;

  // If we now have a token but the existing socket was created without one,
  // tear it down so we reconnect with proper auth.
  if (socket && authToken && socketToken !== authToken) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = authToken;
    socket = io(BASE, {
      withCredentials: true,
      auth: authToken ? { token: authToken } : undefined,
      transports: ['websocket'],
    });
  }

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
}
