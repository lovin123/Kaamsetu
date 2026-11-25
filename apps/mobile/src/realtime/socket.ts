import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';
import { WS_URL } from '../config';

let socket: Socket | null = null;
let joinedProjectId: string | undefined;

export async function connectRealtime(projectId?: string) {
  const token = await getAccessToken();
  if (!token) return null;

  // Reconnect when project room changes so gateway can authorize join
  if (socket?.connected && joinedProjectId === projectId) {
    return socket;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(WS_URL, {
    transports: ['websocket'],
    auth: { token },
    query: projectId ? { projectId } : undefined,
    reconnection: true,
    reconnectionAttempts: 10,
  });
  joinedProjectId = projectId;

  socket.on('connect_error', () => {
    // keep silent; app works without live push
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectRealtime() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  joinedProjectId = undefined;
}
