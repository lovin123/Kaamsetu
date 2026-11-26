import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import {
  Card,
  Loader,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';
import { ProjectPicker } from '../components/ProjectPicker';

type ProjectRow = { id: string; name?: string; code?: string };

export function SummaryScreen() {
  const c = useThemeColors();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api<ProjectRow[]>('/projects')
        .then((list) => {
          setProjects(list);
          setProjectId((prev) => prev || list[0]?.id || '');
        })
        .catch((err) => Alert.alert('Failed to load projects', (err as Error).message))
        .finally(() => setLoading(false));
    }, []),
  );

  const load = async () => {
    if (!projectId) {
      Alert.alert('Select a project', 'Choose a project before generating a summary.');
      return;
    }
    setBusy(true);
    try {
      const data = await api(
        `/summaries/daily?projectId=${encodeURIComponent(projectId)}`,
      );
      setSummary(data);
    } catch (err) {
      Alert.alert('Summary failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <Screen>
      <ScrollView>
        <Title>Daily summary</Title>
        <Subtitle>
          AI summary from live project, task, incident, and blocker records.
        </Subtitle>
        {projects.length > 0 && projectId ? (
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={(id) => {
              setProjectId(id);
              setSummary(null);
            }}
          />
        ) : (
          <Text style={{ color: c.muted, marginBottom: 12 }}>
            No projects available
          </Text>
        )}
        <PrimaryButton
          label={busy ? 'Generating…' : 'Generate today'}
          onPress={load}
          disabled={busy || !projectId}
        />
        {summary && (
          <Card>
            <Text style={{ color: c.muted }}>
              {summary.projectName} · {summary.date}
            </Text>
            <Text
              style={{
                color: c.ink,
                marginTop: 12,
                lineHeight: 22,
                fontSize: 16,
              }}
            >
              {summary.text}
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
