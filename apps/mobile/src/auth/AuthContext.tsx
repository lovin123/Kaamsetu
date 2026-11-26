import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthRole,
  OtpPurpose,
  User,
  api,
  clearSession,
  getRefreshToken,
  getStoredUser,
  onSessionExpired,
  requestOtp as apiRequestOtp,
  updateStoredUser,
  verifyOtp as apiVerifyOtp,
} from '../api/client';
import { clearQueue, flushQueue, pendingCount } from '../offline/queue';
import { connectRealtime, disconnectRealtime } from '../realtime/socket';
import { registerPushToken } from '../notifications/push';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  onboarded: boolean;
  requestOtp: (input: {
    phone: string;
    purpose: OtpPurpose;
    bootstrapSecret?: string;
  }) => Promise<{
    expiresInSeconds: number;
    assignedRole?: AuthRole;
    devCode?: string;
  }>;
  verifyOtp: (input: {
    phone: string;
    code: string;
    purpose: OtpPurpose;
    name?: string;
    bootstrapSecret?: string;
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
  // No projectId → server joins all authorized project rooms for this user
  await connectRealtime();
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
        // Refresh role/profile from server (handles demotion while offline)
        try {
          const me = await api<{
            id: string;
            phone: string;
            name: string;
            role: User['role'];
            preferredLanguage: string;
          }>('/users/me');
          const fresh = {
            id: me.id,
            phone: me.phone,
            name: me.name,
            role: me.role,
            preferredLanguage: me.preferredLanguage,
          };
          setUser(fresh);
          await updateStoredUser(fresh);
        } catch {
          // Keep cached user if offline
        }
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

  useEffect(() => {
    return onSessionExpired(() => {
      clearQueue().catch(() => undefined);
      setUser(null);
      setOnboarded(false);
      disconnectRealtime();
    });
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
      requestOtp: async (input) => {
        const data = await apiRequestOtp(input);
        return {
          expiresInSeconds: data.expiresInSeconds,
          assignedRole: data.assignedRole,
          devCode: data.devCode,
        };
      },
      verifyOtp: async (input) => {
        const data = await apiVerifyOtp(input);
        setUser(data.user);
        if (input.purpose === 'register') {
          setOnboarded(false);
        } else {
          const flag = await AsyncStorage.getItem(onboardKey(data.user.id));
          setOnboarded(flag === '1');
          await flushQueue();
        }
        joinRealtime().catch(() => undefined);
        registerPushToken().catch(() => undefined);
      },
      logout: async () => {
        const pending = await pendingCount();
        if (pending > 0) {
          const discard = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Unsynced updates',
              `You have ${pending} offline update(s). Logging out discards them.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                {
                  text: 'Discard & sign out',
                  style: 'destructive',
                  onPress: () => resolve(true),
                },
              ],
            );
          });
          if (!discard) return;
        }
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          await api('/auth/logout', {
            method: 'POST',
            auth: false,
            body: JSON.stringify({ refreshToken }),
          }).catch(() => undefined);
        }
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
