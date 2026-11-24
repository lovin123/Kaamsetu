import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Field, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function LoginScreen() {
  const { login, register } = useAuth();
  const c = useThemeColors();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('9000000001');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    try {
      setBusy(true);
      if (mode === 'login') {
        await login(phone.trim(), password);
      } else {
        if (!name.trim()) {
          Alert.alert('Name required');
          return;
        }
        await register({
          phone: phone.trim(),
          password,
          name: name.trim(),
        });
      }
    } catch (err) {
      Alert.alert(mode === 'login' ? 'Login failed' : 'Register failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ color: c.accent, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
          KaamSetu
        </Text>
        <Title>{mode === 'login' ? 'Voice-first site work' : 'Create worker account'}</Title>
        <Subtitle>
          Speak progress, incidents, and material needs in Hindi, Marathi, Hinglish, or English.
        </Subtitle>
        <View style={{ height: 28 }} />
        {mode === 'register' && (
          <Field label="Name" value={name} onChangeText={setName} placeholder="Suresh" />
        )}
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="9000000001" />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="password123"
        />
        <PrimaryButton
          label={
            busy
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating…'
              : mode === 'login'
                ? 'Sign in'
                : 'Register as worker'
          }
          onPress={onSubmit}
          disabled={busy}
        />
        <Pressable
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: c.accent, fontWeight: '600' }}>
            {mode === 'login' ? 'New worker? Create account' : 'Have an account? Sign in'}
          </Text>
        </Pressable>
        <Text style={{ color: c.muted, marginTop: 16, fontSize: 13 }}>
          Demo: worker 9000000001 / supervisor 9000000009 — password123
        </Text>
      </View>
    </Screen>
  );
}