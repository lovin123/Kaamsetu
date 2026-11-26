import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, api, getStoredUser } from '../api/client';

const QUEUE_KEY = 'kaamsetu_offline_queue';

export type QueuedMutation = {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  /** Local file URI for voice audio retry */
  audioUri?: string;
  audioName?: string;
  audioType?: string;
  formFields?: Record<string, string>;
  /** Only sent for voice/audio FormData (server whitelist) */
  idempotencyKey?: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
};

async function readQueue(): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
}

async function writeQueue(items: QueuedMutation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueMutation(
  path: string,
  method: string,
  body: unknown,
) {
  const items = await readQueue();
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method,
    body,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  items.push(item);
  await writeQueue(items);
  return item;
}

export async function enqueueVoiceAudio(params: {
  audioUri: string;
  audioName?: string;
  audioType?: string;
  projectId?: string;
  conversationId?: string;
  idempotencyKey?: string;
}) {
  const items = await readQueue();
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path: '/voice/audio',
    method: 'POST',
    audioUri: params.audioUri,
    audioName: params.audioName ?? 'voice.m4a',
    audioType: params.audioType ?? 'audio/m4a',
    formFields: {
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.conversationId
        ? { conversationId: params.conversationId }
        : {}),
    },
    idempotencyKey:
      params.idempotencyKey ??
      `voice-offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  items.push(item);
  await writeQueue(items);
  return item;
}

export async function listQueue() {
  return readQueue();
}

export async function pendingCount() {
  return (await readQueue()).filter((i) => i.status !== 'failed').length;
}

export async function clearQueue() {
  await writeQueue([]);
}

let flushing = false;

export async function flushQueue() {
  if (flushing) return { synced: 0, remaining: 0, skipped: true as const };
  const user = await getStoredUser();
  if (!user) return { synced: 0, remaining: 0, skipped: true as const };

  flushing = true;
  try {
    const items = await readQueue();
    const remaining: QueuedMutation[] = [];
    for (const item of items) {
      try {
        if (item.audioUri) {
          const form = new FormData();
          form.append('audio', {
            uri: item.audioUri,
            name: item.audioName ?? 'voice.m4a',
            type: item.audioType ?? 'audio/m4a',
          } as any);
          if (item.idempotencyKey) {
            form.append('idempotencyKey', item.idempotencyKey);
          }
          if (item.formFields) {
            for (const [k, v] of Object.entries(item.formFields)) {
              form.append(k, v);
            }
          }
          await api(item.path, { method: item.method, body: form });
        } else {
          // Do not inject idempotencyKey into JSON DTOs — most endpoints reject unknown fields
          await api(item.path, {
            method: item.method,
            body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
          });
        }
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        const permanent = status >= 400 && status < 500 && status !== 429;
        if (!permanent) {
          remaining.push({
            ...item,
            status: 'failed',
            lastError: (err as Error).message,
          });
        }
        // Drop permanent 4xx (except rate-limit) so they are not retried forever
      }
    }
    await writeQueue(remaining);
    return {
      synced: items.length - remaining.length,
      remaining: remaining.length,
      skipped: false as const,
    };
  } finally {
    flushing = false;
  }
}
