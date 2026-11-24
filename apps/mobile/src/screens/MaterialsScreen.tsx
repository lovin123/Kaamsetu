import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, Loader, PrimaryButton, Screen, Subtitle, Title, useThemeColors } from '../components/ui';

export function MaterialsScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<any[]>('/materials')
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
      await api(`/materials/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      Alert.alert('Update failed', (err as Error).message);
    }
  };

  if (loading) return <Loader />;

  return (
    <Screen>
      <Title>Material requests</Title>
      <Subtitle>Cable, fittings, and site supplies</Subtitle>
      <View style={{ marginVertical: 10 }}>
        <PrimaryButton label="New material request" onPress={() => nav.navigate('CreateMaterial')} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700' }}>
              {item.quantity} {item.unit} {item.materialName}
            </Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.urgency} · {item.status} · {item.requester?.name}
            </Text>
            {user?.role === 'SUPERVISOR' && item.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <PrimaryButton label="Approve" onPress={() => setStatus(item.id, 'approved')} />
                <PrimaryButton label="Reject" onPress={() => setStatus(item.id, 'rejected')} />
              </View>
            )}
          </Card>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No requests yet.</Text>}
      />
    </Screen>
  );
}