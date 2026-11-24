import React, { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { api } from '../api/client';
import { Card, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function SummaryScreen() {
  const c = useThemeColors();
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const data = await api('/summaries/daily');
      setSummary(data);
    } catch (err) {
      Alert.alert('Summary failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView>
        <Title>Daily summary</Title>
        <Subtitle>AI summary from live project, task, incident, and blocker records.</Subtitle>
        <PrimaryButton label={busy ? 'Generating…' : 'Generate today'} onPress={load} disabled={busy} />
        {summary && (
          <Card>
            <Text style={{ color: c.muted }}>
              {summary.projectName} · {summary.date}
            </Text>
            <Text style={{ color: c.ink, marginTop: 12, lineHeight: 22, fontSize: 16 }}>
              {summary.text}
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}