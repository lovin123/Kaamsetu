import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function WorkforceScreen() {
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [workers, setWorkers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([api<any[]>('/users/workers'), api<any[]>('/tasks')])
        .then(([w, t]) => {
          setWorkers(w);
          setTasks(t);
        })
        .catch((err) => Alert.alert('Failed to load', (err as Error).message))
        .finally(() => setLoading(false));
    }, []),
  );

  if (loading) return <Loader />;

  return (
    <Screen>
      <Title>Workforce</Title>
      <Subtitle>Workers and their active tasks</Subtitle>
      <FlatList
        style={{ marginTop: 12 }}
        data={workers}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const mine = tasks.filter((t) => t.assignee?.id === item.id || t.assigneeId === item.id);
          const avg =
            mine.length === 0
              ? 0
              : Math.round(
                  mine.reduce((s, t) => s + (t.progressPercent || 0), 0) / mine.length,
                );
          return (
            <Pressable onPress={() => nav.navigate('WorkerDetail', { workerId: item.id })}>
              <Card>
                <Text style={{ color: c.ink, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: c.muted, marginTop: 4 }}>
                  {item.phone} · {item.preferredLanguage}
                </Text>
                <Text style={{ color: c.accent, marginTop: 8, fontWeight: '600' }}>
                  {mine.length} tasks · avg {avg}%
                </Text>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No workers found.</Text>}
      />
    </Screen>
  );
}