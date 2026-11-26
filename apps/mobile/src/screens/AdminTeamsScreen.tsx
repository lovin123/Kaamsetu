import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { isAdminRole } from '@kaamsetu/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
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

type Project = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  _count?: { members: number; tasks: number; incidents: number };
};

export function AdminTeamsScreen() {
  const c = useThemeColors();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const admin = user ? isAdminRole(user.role) : false;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<Project[]>('/projects')
      .then(setProjects)
      .catch((err) => Alert.alert('Failed to load teams', (err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    if (!name.trim() || !code.trim()) {
      Alert.alert('Required', 'Name and code are required');
      return;
    }
    try {
      setBusy(true);
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim(),
          location: location.trim() || undefined,
        }),
      });
      setName('');
      setCode('');
      setLocation('');
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
      <Title>{admin ? 'Teams / sites' : 'My teams'}</Title>
      <Subtitle>
        {admin
          ? 'Create projects and assign supervisors & workers.'
          : 'Teams an admin assigned you to. Open one to manage workers.'}
      </Subtitle>
      <View style={{ height: 12 }} />
      {admin && (
        <>
          <PrimaryButton
            label={showCreate ? 'Cancel' : 'New team'}
            onPress={() => setShowCreate((v) => !v)}
          />
          {showCreate && (
            <View style={{ marginTop: 12 }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="Pune Tech Park B" />
              <Field label="Code" value={code} onChangeText={setCode} placeholder="PTP-B" />
              <Field
                label="Location (optional)"
                value={location}
                onChangeText={setLocation}
                placeholder="Hinjewadi"
              />
              <PrimaryButton label={busy ? 'Creating…' : 'Create'} onPress={create} disabled={busy} />
            </View>
          )}
        </>
      )}
      <FlatList
        style={{ marginTop: 16 }}
        data={projects}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => nav.navigate('TeamDetail', { projectId: item.id })}>
            <Card>
              <Text style={{ color: c.ink, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: c.muted, marginTop: 4 }}>
                {item.code}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              <Text style={{ color: c.accent, marginTop: 8, fontWeight: '600' }}>
                {item._count?.members ?? 0} members · {item._count?.tasks ?? 0} tasks
              </Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ color: c.muted }}>
            {admin
              ? 'No teams yet. Create one to get started.'
              : 'No teams assigned yet. Ask your admin to add you to a site.'}
          </Text>
        }
      />
    </Screen>
  );
}
