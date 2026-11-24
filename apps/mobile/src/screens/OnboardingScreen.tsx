import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

const LANGS = [
  { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { id: 'mr-IN', label: 'मराठी (Marathi)' },
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'en-IN', label: 'English' },
];

export function OnboardingScreen() {
  const { user, persistUser, markOnboarded, refreshRealtime } = useAuth();
  const c = useThemeColors();
  const [lang, setLang] = useState(user?.preferredLanguage || 'hi-IN');
  const [projectCode, setProjectCode] = useState('PTP-B');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      const updated = await api<any>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguage: lang }),
      });
      await persistUser({
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
        role: updated.role,
        preferredLanguage: updated.preferredLanguage,
      });
      if (projectCode.trim()) {
        try {
          await api('/projects/join', {
            method: 'POST',
            body: JSON.stringify({ code: projectCode.trim() }),
          });
        } catch {
          // already a member / auto-joined on register — OK
        }
      }
      await refreshRealtime();
      await markOnboarded();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ color: c.accent, fontWeight: '700', marginBottom: 8 }}>KaamSetu</Text>
        <Title>Choose your language</Title>
        <Subtitle>Voice replies will follow this preference.</Subtitle>
        <View style={{ marginVertical: 20, gap: 10 }}>
          {LANGS.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => setLang(l.id)}
              style={{
                padding: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: lang === l.id ? c.accent : c.border,
                backgroundColor: lang === l.id ? c.accentSoft : c.surface,
              }}
            >
              <Text style={{ color: c.ink, fontWeight: '700', fontSize: 16 }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          label="Project code"
          value={projectCode}
          onChangeText={setProjectCode}
          placeholder="PTP-B"
        />
        <PrimaryButton label={busy ? 'Saving…' : 'Continue'} onPress={finish} disabled={busy} />
      </View>
    </Screen>
  );
}