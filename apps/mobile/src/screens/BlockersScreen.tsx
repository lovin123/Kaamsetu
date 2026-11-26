import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { isStaffRole } from '@kaamsetu/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function BlockersScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<any[]>('/blockers')
      .then(setItems)
      .catch((err) => Alert.alert('Failed to load', (err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const resolve = async (id: string) => {
    try {
      await api(`/blockers/${id}/resolve`, { method: 'PATCH', body: '{}' });
      load();
    } catch (err) {
      Alert.alert('Resolve failed', (err as Error).message);
    }
  };

  if (loading && items.length === 0) return <Loader />;

  return (
    <Screen>
      <Title>Blockers</Title>
      <Subtitle>Tasks waiting on materials, access, or other issues</Subtitle>
      <View style={{ marginVertical: 10 }}>
        <PrimaryButton label="Report blocker" onPress={() => nav.navigate('CreateBlocker')} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700' }}>{item.task?.title}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.category} · {item.status}
            </Text>
            <Text style={{ color: c.ink, marginTop: 8 }}>{item.reason}</Text>
            {user && isStaffRole(user.role) && item.status === 'open' && (
              <View style={{ marginTop: 10 }}>
                <PrimaryButton label="Resolve blocker" onPress={() => resolve(item.id)} />
              </View>
            )}
          </Card>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No open blockers.</Text>}
      />
    </Screen>
  );
}