import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { Card, Loader, Screen, Subtitle, Title, useThemeColors } from '../components/ui';
import { flushQueue, listQueue } from '../offline/queue';

export function NotificationsScreen() {
  const c = useThemeColors();
  const [items, setItems] = useState<any[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [notes, queue] = await Promise.all([
        api<any[]>('/notifications'),
        listQueue(),
      ]);
      setItems(notes);
      setPending(queue.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loader />;

  return (
    <Screen>
      <Title>Notifications</Title>
      <Subtitle>
        Alerts and sync status{pending ? ` · ${pending} offline queued` : ''}
      </Subtitle>
      {pending > 0 && (
        <Pressable
          onPress={async () => {
            await flushQueue();
            load();
          }}
          style={{ marginVertical: 10 }}
        >
          <Text style={{ color: c.accent, fontWeight: '700' }}>Sync offline queue</Text>
        </Pressable>
      )}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              api(`/notifications/${item.id}/read`, { method: 'PATCH' })
                .then(load)
                .catch(() => undefined)
            }
          >
            <Card>
              <Text style={{ color: c.ink, fontWeight: item.read ? '500' : '800' }}>
                {item.title}
              </Text>
              <Text style={{ color: c.muted, marginTop: 4 }}>{item.body}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No notifications.</Text>}
      />
    </Screen>
  );
}