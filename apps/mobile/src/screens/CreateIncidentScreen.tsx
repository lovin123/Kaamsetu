import React, { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { api, isNetworkError } from '../api/client';
import { Field, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { enqueueMutation } from '../offline/queue';

export function CreateIncidentScreen({ navigation }: any) {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('electrical');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any[]>('/projects').then((p) => setProjectId(p[0]?.id || ''));
  }, []);

  const submit = async () => {
    if (!title.trim() || !description.trim() || !projectId) {
      Alert.alert('Required', 'Title, description, and project needed');
      return;
    }
    setBusy(true);
    const body = {
      projectId,
      title: title.trim(),
      description: description.trim(),
      location: location.trim() || undefined,
      category,
      severity: 'medium',
    };
    try {
      await api('/incidents', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Reported', 'Supervisor notified');
      navigation.goBack();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueMutation('/incidents', 'POST', body);
        Alert.alert('Queued offline', (err as Error).message);
        navigation.goBack();
      } else {
        Alert.alert('Submit failed', (err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView>
        <Title>Report incident</Title>
        <Subtitle>Or use the mic tab to report by voice</Subtitle>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Panel issue" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Electrical panel sparking on second floor"
        />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Second floor" />
        <Field
          label="Category (electrical/plumbing/safety/other)"
          value={category}
          onChangeText={setCategory}
        />
        <PrimaryButton label={busy ? 'Submitting…' : 'Submit incident'} onPress={submit} disabled={busy} />
      </ScrollView>
    </Screen>
  );
}