import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function IncidentsScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<any[]>('/incidents')
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      Alert.alert('Update failed', (err as Error).message);
    }
  };

  if (loading && items.length === 0) return <Loader />;

  return (
    <Screen>
      <Title>Incidents</Title>
      <Subtitle>Reported site issues and hazards</Subtitle>
      <View style={{ marginVertical: 10 }}>
        <PrimaryButton label="Report incident" onPress={() => nav.navigate('CreateIncident')} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.category} · {item.severity} · {item.status}
            </Text>
            <Text style={{ color: c.ink, marginTop: 8 }}>{item.description}</Text>
            {user?.role === 'SUPERVISOR' && item.status === 'open' && (
              <View style={{ marginTop: 10 }}>
                <PrimaryButton
                  label="Acknowledge"
                  onPress={() => setStatus(item.id, 'acknowledged')}
                />
              </View>
            )}
            {user?.role === 'SUPERVISOR' && item.status === 'acknowledged' && (
              <View style={{ marginTop: 10 }}>
                <PrimaryButton label="Resolve" onPress={() => setStatus(item.id, 'resolved')} />
              </View>
            )}
          </Card>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No incidents yet.</Text>}
      />
    </Screen>
  );
}