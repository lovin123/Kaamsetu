import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'kaamsetu_token';
const REFRESH_KEY = 'kaamsetu_refresh';
const USER_KEY = 'kaamsetu_user';

export type User = {
  id: string;
  phone: string;
  name: string;
  role: 'WORKER' | 'SUPERVISOR' | 'ADMIN';
  preferredLanguage: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Nest often returns { message: string | string[], statusCode } */
function parseApiErrorMessage(text: string, fallback: string): string {
  if (!text?.trim()) return fallback;
  try {
    const body = JSON.parse(text) as { message?: unknown };
    const msg = body.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) {
      return msg.map(String).join(', ');
    }
  } catch {
    // plain text
  }
  return text;
}

export class SessionExpiredError extends Error {
  constructor(message = 'Session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionExpired(listener: SessionListener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function emitSessionExpired() {
  for (const listener of sessionListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

async function getSecure(key: string): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(key);
    if (secure) return secure;
  } catch {
    // SecureStore unavailable (web/tests) — fall through
  }
  // Migrate legacy AsyncStorage tokens once
  const legacy = await AsyncStorage.getItem(key);
  if (legacy) {
    try {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    } catch {
      // keep legacy if SecureStore write fails
    }
  }
  return legacy;
}

async function setSecure(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function deleteSecure(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(key);
}

export async function getAccessToken() {
  return getSecure(TOKEN_KEY);
}

export async function setSession(
  token: string,
  user: User,
  refreshToken?: string,
) {
  await setSecure(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) await setSecure(REFRESH_KEY, refreshToken);
}

export async function updateStoredUser(user: User) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  await deleteSecure(TOKEN_KEY);
  await deleteSecure(REFRESH_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

let refreshPromise: Promise<string | null> | null = null;

async function doRefreshAccessToken(): Promise<string | null> {
  const refreshToken = await getSecure(REFRESH_KEY);
  if (!refreshToken) {
    await clearSession();
    emitSessionExpired();
    return null;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearSession();
      emitSessionExpired();
      return null;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken?: string;
      user: User;
    };
    await setSession(
      data.accessToken,
      data.user,
      data.refreshToken ?? refreshToken,
    );
    return data.accessToken;
  } catch {
    // Network failure during refresh — keep existing session for offline use
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (options.auth !== false) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && options.auth !== false) {
    const next = await refreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } else {
      // Refresh failed or session cleared — surface as auth error
      const text = await res.text().catch(() => '');
      throw new ApiError(401, parseApiErrorMessage(text, 'Unauthorized'));
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(
      res.status,
      parseApiErrorMessage(text, `HTTP ${res.status}`),
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function isNetworkError(err: unknown) {
  if (err instanceof TypeError) return true;
  const msg = (err as Error)?.message?.toLowerCase?.() ?? '';
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('offline') ||
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('unable to resolve') ||
    msg.includes('socket') ||
    msg.includes('network request failed')
  );
}

export type AuthRole = 'WORKER' | 'SUPERVISOR' | 'ADMIN';
export type OtpPurpose = 'login' | 'register';

export type BootstrapStatus = {
  firstAdminOpen: boolean;
  defaultRegisterRole: 'ADMIN' | 'WORKER';
};

export async function getRefreshToken() {
  return getSecure(REFRESH_KEY);
}

export async function getBootstrapStatus() {
  return api<BootstrapStatus>('/auth/bootstrap-status', {
    method: 'GET',
    auth: false,
  });
}

export async function requestOtp(input: {
  phone: string;
  purpose: OtpPurpose;
  bootstrapSecret?: string;
}) {
  return api<{
    ok: true;
    expiresInSeconds: number;
    assignedRole?: AuthRole;
    /** Present in development / when OTP_DEV_EXPOSE=true */
    devCode?: string;
  }>('/auth/otp/request', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(input),
  });
}

export async function verifyOtp(input: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
  name?: string;
  preferredLanguage?: string;
  bootstrapSecret?: string;
}) {
  const data = await api<{
    accessToken: string;
    refreshToken: string;
    user: User;
  }>('/auth/otp/verify', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(input),
  });
  await setSession(data.accessToken, data.user, data.refreshToken);
  return data;
}
