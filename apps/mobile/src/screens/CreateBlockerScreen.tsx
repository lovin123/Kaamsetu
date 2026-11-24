import React, { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { api, isNetworkError } from '../api/client';
import { Field, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { enqueueMutation } from '../offline/queue';

export function CreateBlockerScreen({ navigation }: any) {
  const [projectId, setProjectId] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const projects = await api<any[]>('/projects');
      const pid = projects[0]?.id || '';
      setProjectId(pid);
      const list = await api<any[]>('/tasks');
      setTasks(list);
      setTaskId(list[0]?.id || '');
    })().catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!projectId || !taskId || !reason.trim()) {
      Alert.alert('Required', 'Task and reason needed');
      return;
    }
    setBusy(true);
    const body = {
      projectId,
      taskId,
      reason: reason.trim(),
      category: 'other',
    };
    try {
      await api('/blockers', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Logged', 'Blocker reported');
      navigation.goBack();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueMutation('/blockers', 'POST', body);
        Alert.alert('Queued offline', (err as Error).message);
        navigation.goBack();
      } else {
        Alert.alert('Submit failed', (err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView>
        <Title>Report blocker</Title>
        <Subtitle>
          Task: {tasks.find((t) => t.id === taskId)?.title || 'Loading…'}
        </Subtitle>
        <Field
          label="Switch task id (optional)"
          value={taskId}
          onChangeText={setTaskId}
          placeholder="task uuid"
        />
        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Waiting for copper cable delivery"
        />
        <PrimaryButton
          label={busy ? 'Submitting…' : 'Submit blocker'}
          onPress={submit}
          disabled={busy}
        />
      </ScrollView>
    </Screen>
  );
}