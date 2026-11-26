import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Text } from 'react-native';
import { api } from '../api/client';
import {
  Card,
  Loader,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';

export function WorkerDetailScreen({ route }: any) {
  const { workerId } = route.params;
  const c = useThemeColors();
  const [worker, setWorker] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    Promise.all([api<any[]>('/users/workers'), api<any[]>('/tasks')])
      .then(([workers, all]) => {
        const found = workers.find((w) => w.id === workerId) || null;
        setWorker(found);
        setTasks(
          all.filter(
            (t) => t.assignee?.id === workerId || t.assigneeId === workerId,
          ),
        );
        if (!found) {
          setLoadError('Worker not found on this team');
        }
      })
      .catch((err) => {
        setLoadError((err as Error).message);
        Alert.alert('Failed to load worker', (err as Error).message);
      });
  }, [workerId]);

  if (!worker) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Title>Worker</Title>
            <Subtitle>{loadError}</Subtitle>
          </>
        ) : (
          <Loader />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{worker.name}</Title>
      <Subtitle>
        {worker.phone} · {worker.preferredLanguage}
      </Subtitle>
      <FlatList
        style={{ marginTop: 12 }}
        data={tasks}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.status} · {item.progressPercent}% · {item.location || 'Site'}
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={{ color: c.muted }}>No assigned tasks.</Text>
        }
      />
    </Screen>
  );
}
