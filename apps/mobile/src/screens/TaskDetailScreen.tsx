import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { api, isNetworkError } from '../api/client';
import { Card, Field, Loader, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';
import { enqueueMutation } from '../offline/queue';

export function TaskDetailScreen({ route }: any) {
  const { taskId } = route.params;
  const c = useThemeColors();
  const [task, setTask] = useState<any>(null);
  const [percent, setPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/tasks/${taskId}`).then((t: any) => {
      setTask(t);
      setPercent(String(t.progressPercent ?? 0));
    });
  }, [taskId]);

  if (!task) return <Loader />;

  const save = async () => {
    setBusy(true);
    const body = {
      progressPercent: Number(percent),
      notes,
      source: 'manual',
    };
    try {
      await api(`/tasks/${taskId}/progress`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      Alert.alert('Saved', 'Progress updated');
      const refreshed = await api(`/tasks/${taskId}`);
      setTask(refreshed);
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueMutation(`/tasks/${taskId}/progress`, 'PATCH', body);
        Alert.alert('Queued offline', (err as Error).message);
      } else {
        Alert.alert('Update failed', (err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{task.title}</Title>
      <Subtitle>
        {task.location || 'Site'} · {task.status} · {task.progressPercent}%
      </Subtitle>
      <Card>
        <Text style={{ color: c.muted }}>{task.description || 'No description'}</Text>
      </Card>
      <Field label="Progress %" value={percent} onChangeText={setPercent} />
      <Field label="Notes" value={notes} onChangeText={setNotes} />
      <PrimaryButton label={busy ? 'Saving…' : 'Update progress'} onPress={save} disabled={busy} />
      <View style={{ height: 12 }} />
      <Text style={{ color: c.ink, fontWeight: '700', marginBottom: 8 }}>Recent updates</Text>
      {(task.progressUpdates || []).map((p: any) => (
        <Card key={p.id}>
          <Text style={{ color: c.ink }}>{p.progressPercent}% — {p.user?.name}</Text>
          <Text style={{ color: c.muted }}>{p.notes || p.transcript || ''}</Text>
        </Card>
      ))}
    </Screen>
  );
}