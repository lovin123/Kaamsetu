import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { registerPushToken } from '../notifications/push';
import { Field, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function ProfileScreen() {
  const { user, logout, persistUser } = useAuth();
  const nav = useNavigation<any>();
  const c = useThemeColors();
  const [language, setLanguage] = useState(user?.preferredLanguage || 'hi-IN');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api<any>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguage: language }),
      });
      await persistUser({
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
        role: updated.role,
        preferredLanguage: updated.preferredLanguage,
      });
      Alert.alert('Saved', 'Language preference updated');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const registerPush = async () => {
    try {
      const token = await registerPushToken();
      Alert.alert('Push registered', token);
    } catch (err) {
      Alert.alert('Push registration failed', (err as Error).message);
    }
  };

  return (
    <Screen>
      <Title>{user?.name}</Title>
      <Subtitle>
        {user?.role} · {user?.phone}
      </Subtitle>
      <View style={{ height: 18 }} />
      <Field
        label="Preferred language (hi-IN / mr-IN / en-IN / hinglish)"
        value={language}
        onChangeText={setLanguage}
      />
      <PrimaryButton label={busy ? 'Saving…' : 'Save preferences'} onPress={save} disabled={busy} />
      <View style={{ height: 12 }} />
      <PrimaryButton label="Enable push notifications" onPress={registerPush} />
      <View style={{ height: 12 }} />
      <PrimaryButton label="Blockers" onPress={() => nav.navigate('Blockers')} />
      {__DEV__ && (
        <>
          <View style={{ height: 12 }} />
          <PrimaryButton label="Audio denoise PoC" onPress={() => nav.navigate('AudioPoC')} />
        </>
      )}
      <View style={{ height: 12 }} />
      <PrimaryButton label="Sign out" onPress={() => logout()} />
      <Text style={{ color: c.muted, marginTop: 16, fontSize: 12 }}>
        Push uses Expo Push Token (works without Firebase). Firebase FCM Admin is used when a native FCM token is stored.
      </Text>
    </Screen>
  );
}