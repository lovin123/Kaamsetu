import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { isFieldWorker } from '@kaamsetu/shared';
import { ApiError, api } from '../api/client';
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
  const worker = user ? isFieldWorker(user.role) : true;

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
      if (worker && projectCode.trim()) {
        try {
          await api('/projects/join', {
            method: 'POST',
            body: JSON.stringify({ code: projectCode.trim() }),
          });
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 409) {
            Alert.alert(
              'Project join failed',
              (err as Error).message ||
                'Could not join that project code. Try again from Profile later.',
            );
          }
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
        <Subtitle>
          {worker
            ? 'Voice replies follow this preference. Join your site with a project code.'
            : 'Voice replies follow this preference. Your admin assigns you to teams.'}
        </Subtitle>
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
        {worker ? (
          <Field
            label="Project code"
            value={projectCode}
            onChangeText={setProjectCode}
            placeholder="PTP-B"
          />
        ) : (
          <Text style={{ color: c.muted, marginBottom: 16, fontSize: 14, lineHeight: 20 }}>
            {user?.role === 'ADMIN'
              ? 'As Admin you can create teams and assign supervisors/workers from the Teams and Users tabs.'
              : 'As Supervisor you only see teams an admin assigned you to. Contact your admin if the list is empty.'}
          </Text>
        )}
        <PrimaryButton label={busy ? 'Saving…' : 'Continue'} onPress={finish} disabled={busy} />
      </View>
    </Screen>
  );
}
