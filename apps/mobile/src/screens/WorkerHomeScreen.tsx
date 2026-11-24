import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

type Task = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  location?: string;
  project?: { name: string };
};

export function WorkerHomeScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Task[]>('/tasks');
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !tasks.length) return <Loader />;

  return (
    <Screen>
      <Title>Namaste, {user?.name?.split(' ')[0]}</Title>
      <Subtitle>Your assigned site tasks. Tap the mic tab to speak updates.</Subtitle>
      <Pressable
        onPress={() => nav.navigate('Voice')}
        style={{
          marginTop: 18,
          marginBottom: 12,
          backgroundColor: c.accent,
          borderRadius: 18,
          padding: 18,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Open voice assistant</Text>
        <Text style={{ color: '#E8FFF5', marginTop: 4 }}>
          Progress, incidents, materials — just speak
        </Text>
      </Pressable>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => nav.navigate('TaskDetail', { taskId: item.id })}>
            <Card>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{item.title}</Text>
              <Text style={{ color: c.muted, marginTop: 4 }}>
                {item.project?.name} · {item.location || 'Site'} · {item.progressPercent}%
              </Text>
              <View
                style={{
                  marginTop: 10,
                  alignSelf: 'flex-start',
                  backgroundColor: c.accentSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: c.accent, fontWeight: '600' }}>{item.status}</Text>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ color: c.muted, marginTop: 24 }}>No tasks assigned yet.</Text>
        }
      />
    </Screen>
  );
}