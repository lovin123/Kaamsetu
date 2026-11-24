import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'kaamsetu_token';
const REFRESH_KEY = 'kaamsetu_refresh';
const USER_KEY = 'kaamsetu_user';

export type User = {
  id: string;
  phone: string;
  name: string;
  role: 'WORKER' | 'SUPERVISOR';
  preferredLanguage: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setSession(
  token: string,
  user: User,
  refreshToken?: string,
) {
  const pairs: [string, string][] = [
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ];
  if (refreshToken) pairs.push([REFRESH_KEY, refreshToken]);
  await AsyncStorage.multiSet(pairs);
}

export async function updateStoredUser(user: User) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, REFRESH_KEY]);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!refreshToken) {
    await clearSession();
    return null;
  }
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await clearSession();
    return null;
  }
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken?: string;
    user: User;
  };
  await setSession(data.accessToken, data.user, data.refreshToken ?? refreshToken);
  return data.accessToken;
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
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && options.auth !== false) {
    const next = await refreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function isNetworkError(err: unknown) {
  const msg = (err as Error)?.message?.toLowerCase?.() ?? '';
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('offline')
  );
}

export async function login(phone: string, password: string) {
  const data = await api<{
    accessToken: string;
    refreshToken: string;
    user: User;
  }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ phone, password }),
  });
  await setSession(data.accessToken, data.user, data.refreshToken);
  return data;
}

export async function register(input: {
  phone: string;
  password: string;
  name: string;
  preferredLanguage?: string;
}) {
  const data = await api<{
    accessToken: string;
    refreshToken: string;
    user: User;
  }>('/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ ...input, role: 'WORKER' }),
  });
  await setSession(data.accessToken, data.user, data.refreshToken);
  return data;
}