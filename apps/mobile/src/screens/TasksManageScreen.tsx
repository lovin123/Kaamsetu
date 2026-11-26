import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import {
  Card,
  Field,
  Loader,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';
import { ProjectPicker } from '../components/ProjectPicker';

export function TasksManageScreen() {
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [tasks, setTasks] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, w, p] = await Promise.all([
        api<any[]>('/tasks'),
        api<any[]>('/users/workers'),
        api<any[]>('/projects'),
      ]);
      setTasks(t);
      setWorkers(w);
      setProjects(p);
      setProjectId((prev) => prev || p[0]?.id || '');
      setAssigneeId((prev) => prev || w[0]?.id || '');
    } catch (err) {
      Alert.alert('Failed to load', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    if (!title.trim() || !projectId) {
      Alert.alert('Missing fields', 'Title and project required');
      return;
    }
    setBusy(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          location: location.trim() || undefined,
          assigneeId: assigneeId || undefined,
        }),
      });
      setTitle('');
      setLocation('');
      await load();
      Alert.alert('Created', 'Task assigned');
    } catch (err) {
      Alert.alert('Failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !tasks.length) return <Loader />;

  return (
    <Screen>
      <Title>Task management</Title>
      <Subtitle>Assign and track site work</Subtitle>
      <Card>
        {projects.length > 0 && projectId ? (
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={setProjectId}
          />
        ) : null}
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Second floor wiring" />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Second floor" />
        <Text style={{ color: c.muted, marginBottom: 8 }}>Assignee</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {workers.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => setAssigneeId(w.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: assigneeId === w.id ? c.accent : c.accentSoft,
              }}
            >
              <Text style={{ color: assigneeId === w.id ? '#fff' : c.accent, fontWeight: '600' }}>
                {w.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label={busy ? 'Creating…' : 'Create task'} onPress={create} disabled={busy} />
      </Card>
      <FlatList
        data={tasks}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => nav.navigate('TaskDetail', { taskId: item.id })}>
            <Card>
              <Text style={{ color: c.ink, fontWeight: '700' }}>{item.title}</Text>
              <Text style={{ color: c.muted, marginTop: 4 }}>
                {item.assignee?.name || 'Unassigned'} · {item.progressPercent}% · {item.status}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}