import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { AuthRole, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole, isStaffRole } from '@kaamsetu/shared';
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

type MemberRow = {
  id: string;
  role: AuthRole;
  user: { id: string; name: string; phone: string; role: AuthRole };
};

type DirectoryUser = {
  id: string;
  name: string;
  phone: string;
  role: AuthRole;
};

export function TeamDetailScreen() {
  const c = useThemeColors();
  const { user } = useAuth();
  const route = useRoute<any>();
  const projectId = route.params?.projectId as string;
  const admin = user ? isAdminRole(user.role) : false;
  const staff = user ? isStaffRole(user.role) : false;

  const [projectName, setProjectName] = useState('Team');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [newRole, setNewRole] = useState<AuthRole>('WORKER');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      api<any>(`/projects/${projectId}`),
      api<MemberRow[]>(`/projects/${projectId}/members`),
      admin ? api<DirectoryUser[]>('/users') : Promise.resolve([] as DirectoryUser[]),
    ])
      .then(([project, memberRows, users]) => {
        setProjectName(project.name);
        setMembers(memberRows);
        setDirectory(users);
      })
      .catch((err) => Alert.alert('Failed to load team', (err as Error).message))
      .finally(() => setLoading(false));
  }, [projectId, admin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addByPhone = async () => {
    if (!addPhone.trim()) {
      Alert.alert('Phone required');
      return;
    }
    try {
      setBusy(true);
      await api(`/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ phone: addPhone.trim(), role: 'WORKER' }),
      });
      setAddPhone('');
      load();
    } catch (err) {
      Alert.alert('Add failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addExisting = async (userId: string, role: AuthRole) => {
    try {
      setBusy(true);
      await api(`/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
      });
      load();
    } catch (err) {
      Alert.alert('Add failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createAndAssign = async () => {
    if (!admin) return;
    if (!phone.trim() || !name.trim()) {
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
          role: newRole,
          projectId,
        }),
      });
      setPhone('');
      setName('');
      load();
    } catch (err) {
      Alert.alert('Create failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    try {
      setBusy(true);
      await api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      Alert.alert('Remove failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;

  const memberIds = new Set(members.map((m) => m.user.id));
  const candidates = directory.filter((u) => !memberIds.has(u.id));

  return (
    <Screen>
      <Title>{projectName}</Title>
      <Subtitle>
        {admin
          ? 'Assign supervisors and workers to this team.'
          : 'Add workers (by phone) to your assigned team.'}
      </Subtitle>

      <Text style={{ color: c.ink, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>
        Members ({members.length})
      </Text>
      <FlatList
        data={members}
        keyExtractor={(i) => i.id}
        style={{ maxHeight: 200 }}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ color: c.ink, fontWeight: '700' }}>{item.user.name}</Text>
            <Text style={{ color: c.muted, marginTop: 4 }}>
              {item.user.phone} · {item.role}
            </Text>
            {staff && (
              <Pressable onPress={() => remove(item.user.id)} style={{ marginTop: 8 }} disabled={busy}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            )}
          </Card>
        )}
        ListEmptyComponent={<Text style={{ color: c.muted }}>No members yet.</Text>}
      />

      {staff && (
      <View style={{ marginTop: 12 }}>
        <Text style={{ color: c.ink, fontWeight: '700', marginBottom: 8 }}>
          Add worker by phone
        </Text>
        <Field
          label="Existing worker phone"
          value={addPhone}
          onChangeText={setAddPhone}
          placeholder="9000000001"
          keyboardType="phone-pad"
        />
        <PrimaryButton label={busy ? 'Adding…' : 'Add worker'} onPress={addByPhone} disabled={busy} />
      </View>
      )}

      {admin && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.ink, fontWeight: '700', marginBottom: 8 }}>
            Create user & assign
          </Text>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="9000000010"
            keyboardType="phone-pad"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['WORKER', 'SUPERVISOR', 'ADMIN'] as AuthRole[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setNewRole(r)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: newRole === r ? c.accent : c.border,
                  backgroundColor: newRole === r ? c.accent : c.surface,
                }}
              >
                <Text
                  style={{
                    color: newRole === r ? '#fff' : c.ink,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label={busy ? 'Saving…' : 'Create & assign'}
            onPress={createAndAssign}
            disabled={busy}
          />

          <Text style={{ color: c.ink, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>
            Add existing user
          </Text>
          <FlatList
            data={candidates}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <Card>
                <Text style={{ color: c.ink, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: c.muted, marginTop: 4 }}>
                  {item.phone} · {item.role}
                </Text>
                <Pressable
                  onPress={() => addExisting(item.id, item.role)}
                  style={{ marginTop: 8 }}
                  disabled={busy}
                >
                  <Text style={{ color: c.accent, fontWeight: '600' }}>Add to team</Text>
                </Pressable>
              </Card>
            )}
            ListEmptyComponent={<Text style={{ color: c.muted }}>No other users available.</Text>}
          />
        </View>
      )}
    </Screen>
  );
}
