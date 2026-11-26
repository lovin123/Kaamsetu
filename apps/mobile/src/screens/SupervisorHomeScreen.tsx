import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';
import { getSocket, onSocketReady } from '../realtime/socket';

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
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const onProgress = () => load();
      const onConnect = () => setLiveHint('Live updates on');
      const onDisconnect = () => setLiveHint('Live updates offline');

      const bind = (s: NonNullable<ReturnType<typeof getSocket>>) => {
        setLiveHint(s.connected ? 'Live updates on' : 'Live updates offline');
        s.on('task.progress', onProgress);
        s.on('incident.created', onProgress);
        s.on('material.created', onProgress);
        s.on('blocker.created', onProgress);
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
      };

      const existing = getSocket();
      if (existing) bind(existing);
      const unsubReady = onSocketReady(bind);

      return () => {
        unsubReady();
        const current = getSocket();
        current?.off('task.progress', onProgress);
        current?.off('incident.created', onProgress);
        current?.off('material.created', onProgress);
        current?.off('blocker.created', onProgress);
        current?.off('connect', onConnect);
        current?.off('disconnect', onDisconnect);
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