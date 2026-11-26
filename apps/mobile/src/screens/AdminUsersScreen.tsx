import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthRole, api } from '../api/client';
import {
  Card,
  Field,
  Loader,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';

type ListedUser = {
  id: string;
  name: string;
  phone: string;
  role: AuthRole;
  preferredLanguage?: string;
  memberships?: { role: AuthRole; project: { id: string; name: string; code: string } }[];
};

const ROLE_OPTIONS: AuthRole[] = ['WORKER', 'SUPERVISOR', 'ADMIN'];

export function AdminUsersScreen() {
  const c = useThemeColors();
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AuthRole>('SUPERVISOR');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<ListedUser[]>('/users')
      .then(setUsers)
      .catch((err) => Alert.alert('Failed to load users', (err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const setUserRole = async (user: ListedUser, next: AuthRole) => {
    if (user.role === next) return;
    try {
      setBusyId(user.id);
      const updated = await api<ListedUser>(`/users/${user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: next }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (err) {
      Alert.alert('Role update failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Required', 'Name and phone are required');
      return;
    }
    try {
      setBusy(true);
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          role,
        }),
      });
      setName('');
      setPhone('');
      setShowCreate(false);
      load();
    } catch (err) {
      Alert.alert('Create failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <Screen>
      <Title>Users & roles</Title>
      <Subtitle>
        Create supervisors/workers and change roles. Assign them to teams from the Teams tab.
      </Subtitle>
      <View style={{ height: 12 }} />
      <PrimaryButton
        label={showCreate ? 'Cancel' : 'Create user'}
        onPress={() => setShowCreate((v) => !v)}
      />
      {showCreate && (
        <View style={{ marginTop: 12 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="9000000010"
            keyboardType="phone-pad"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {ROLE_OPTIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: role === r ? c.accent : c.border,
                  backgroundColor: role === r ? c.accent : c.surface,
                }}
              >
                <Text style={{ color: role === r ? '#fff' : c.ink, fontWeight: '700', fontSize: 12 }}>
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={busy ? 'Creating…' : 'Create'} onPress={createUser} disabled={busy} />
        </View>
      )}
      <FlatList
        style={{ marginTop: 12 }}
        data={users}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.phone} · {item.role}
            </Text>
            {!!item.memberships?.length && (
              <Text style={{ color: c.muted, marginTop: 4, fontSize: 12 }}>
                Teams: {item.memberships.map((m) => m.project.code).join(', ')}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {ROLE_OPTIONS.map((r) => {
                const selected = item.role === r;
                const disabled = busyId === item.id;
                return (
                  <Pressable
                    key={r}
                    disabled={disabled}
                    onPress={() => setUserRole(item, r)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: selected ? c.accent : c.border,
                      backgroundColor: selected ? c.accent : c.surface,
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? '#fff' : c.ink,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No users found.</Text>}
      />
    </Screen>
  );
}
