import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';
import { WS_URL } from '../config';

let socket: Socket | null = null;
/** When set, socket joined an explicit project room; otherwise all authorized rooms */
let joinedProjectId: string | undefined;
const connectListeners = new Set<(s: Socket) => void>();

export function onSocketReady(listener: (s: Socket) => void) {
  connectListeners.add(listener);
  if (socket?.connected) listener(socket);
  return () => {
    connectListeners.delete(listener);
  };
}

function emitReady(s: Socket) {
  for (const listener of connectListeners) {
    try {
      listener(s);
    } catch {
      // ignore
    }
  }
}

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
    // Resolve token on every (re)connect — avoids stale JWT after HTTP refresh
    auth: (cb) => {
      getAccessToken()
        .then((t) => cb({ token: t }))
        .catch(() => cb({ token: null }));
    },
    query: projectId ? { projectId } : undefined,
    reconnection: true,
    reconnectionAttempts: 10,
  });
  joinedProjectId = projectId;

  socket.on('connect', () => {
    if (socket) emitReady(socket);
  });
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
