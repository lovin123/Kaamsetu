import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { api, isNetworkError } from '../api/client';
import { ProjectPicker } from '../components/ProjectPicker';
import {
  Field,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';
import { enqueueMutation } from '../offline/queue';

export function CreateBlockerScreen({ navigation }: any) {
  const c = useThemeColors();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await api<any[]>('/projects');
      setProjects(list);
      const pid = list[0]?.id || '';
      setProjectId(pid);
      const taskList = await api<any[]>('/tasks');
      setTasks(taskList);
      setTaskId(taskList[0]?.id || '');
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const filtered = tasks.filter((t) => !t.projectId || t.projectId === projectId);
    if (filtered.length && !filtered.find((t) => t.id === taskId)) {
      setTaskId(filtered[0].id);
    }
  }, [projectId, tasks, taskId]);

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

  const visibleTasks = tasks.filter((t) => !t.projectId || t.projectId === projectId);

  return (
    <Screen>
      <ScrollView>
        <Title>Report blocker</Title>
        <Subtitle>Pick the blocked task and describe why work stopped</Subtitle>
        <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        <Text style={{ color: c.muted, fontWeight: '600', marginBottom: 4 }}>Task</Text>
        {visibleTasks.map((t) => {
          const selected = t.id === taskId;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTaskId(t.id)}
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? c.accent : c.border,
                backgroundColor: selected ? c.accentSoft : c.surface,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: c.ink, fontWeight: selected ? '800' : '600' }}>
                {t.title}
              </Text>
            </Pressable>
          );
        })}
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
