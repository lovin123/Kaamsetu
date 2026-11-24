import React, { useEffect, useState } from 'react';
import { FlatList, Text } from 'react-native';
import { api } from '../api/client';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function WorkerDetailScreen({ route }: any) {
  const { workerId } = route.params;
  const c = useThemeColors();
  const [worker, setWorker] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([api<any[]>('/users/workers'), api<any[]>('/tasks')]).then(([workers, all]) => {
      setWorker(workers.find((w) => w.id === workerId) || null);
      setTasks(all.filter((t) => t.assignee?.id === workerId || t.assigneeId === workerId));
    });
  }, [workerId]);

  if (!worker) return <Loader />;

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
        ListEmptyComponent={<Text style={{ color: c.muted }}>No assigned tasks.</Text>}
      />
    </Screen>
  );
}