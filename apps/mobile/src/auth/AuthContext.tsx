import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  api,
  clearSession,
  getStoredUser,
  login as apiLogin,
  register as apiRegister,
  updateStoredUser,
} from '../api/client';
import { clearQueue, flushQueue } from '../offline/queue';
import { connectRealtime, disconnectRealtime } from '../realtime/socket';
import { registerPushToken } from '../notifications/push';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  onboarded: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (input: {
    phone: string;
    password: string;
    name: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
  persistUser: (u: User) => Promise<void>;
  markOnboarded: () => Promise<void>;
  refreshRealtime: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function onboardKey(userId: string) {
  return `kaamsetu_onboarded:${userId}`;
}

async function joinRealtime() {
  try {
    const projects = await api<{ id: string }[]>('/projects');
    await connectRealtime(projects[0]?.id);
  } catch {
    // Gateway joins all memberships when projectId omitted
    await connectRealtime();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getStoredUser();
      setUser(stored);
      if (stored) {
        const flag = await AsyncStorage.getItem(onboardKey(stored.id));
        setOnboarded(flag === '1');
        flushQueue().catch(() => undefined);
        joinRealtime().catch(() => undefined);
        registerPushToken().catch(() => undefined);
      } else {
        setOnboarded(false);
      }
      setLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      onboarded,
      setUser,
      persistUser: async (u) => {
        setUser(u);
        await updateStoredUser(u);
      },
      markOnboarded: async () => {
        if (!user) return;
        await AsyncStorage.setItem(onboardKey(user.id), '1');
        setOnboarded(true);
      },
      refreshRealtime: async () => {
        await joinRealtime();
      },
      login: async (phone, password) => {
        const data = await apiLogin(phone, password);
        setUser(data.user);
        const flag = await AsyncStorage.getItem(onboardKey(data.user.id));
        setOnboarded(flag === '1');
        await flushQueue();
        joinRealtime().catch(() => undefined);
        registerPushToken().catch(() => undefined);
      },
      register: async (input) => {
        const data = await apiRegister(input);
        setUser(data.user);
        setOnboarded(false);
        joinRealtime().catch(() => undefined);
        registerPushToken().catch(() => undefined);
      },
      logout: async () => {
        disconnectRealtime();
        await clearQueue();
        await clearSession();
        setUser(null);
        setOnboarded(false);
      },
    }),
    [user, loading, onboarded],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
