import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';
import { getSocket } from '../realtime/socket';

export function SupervisorHomeScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [projects, setProjects] = useState<any[]>([]);
  const [liveHint, setLiveHint] = useState('Connecting…');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api<any[]>('/projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const s = getSocket();
      setLiveHint(s?.connected ? 'Live updates on' : 'Live updates offline');
      const onProgress = () => load();
      s?.on('task.progress', onProgress);
      s?.on('incident.created', onProgress);
      s?.on('material.created', onProgress);
      s?.on('blocker.created', onProgress);
      return () => {
        s?.off('task.progress', onProgress);
        s?.off('incident.created', onProgress);
        s?.off('material.created', onProgress);
        s?.off('blocker.created', onProgress);
      };
    }, [load]),
  );

  if (loading) return <Loader />;

  return (
    <Screen>
      <Title>Site overview</Title>
      <Subtitle>
        Welcome {user?.name}. {liveHint}
      </Subtitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 14 }}>
        {[
          { label: 'Daily summary', route: 'Summary' },
          { label: 'Ask by voice', route: 'Voice' },
          { label: 'Materials', route: 'Materials' },
          { label: 'Blockers', route: 'Blockers' },
          { label: 'Alerts', route: 'Alerts' },
        ].map((b) => (
          <Pressable
            key={b.route}
            onPress={() => nav.navigate(b.route)}
            style={{
              backgroundColor: b.route === 'Summary' ? c.accent : c.surface,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: c.border,
              minWidth: '45%',
              flexGrow: 1,
            }}
          >
            <Text
              style={{
                color: b.route === 'Summary' ? '#fff' : c.ink,
                fontWeight: '700',
              }}
            >
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{item.name}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.location} · {item._count?.tasks ?? 0} tasks · {item._count?.incidents ?? 0} incidents
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}