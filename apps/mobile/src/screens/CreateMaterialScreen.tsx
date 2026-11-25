import React, { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { api, isNetworkError } from '../api/client';
import { ProjectPicker } from '../components/ProjectPicker';
import { Field, PrimaryButton, Screen, Subtitle, Title } from '../components/ui';
import { enqueueMutation } from '../offline/queue';

export function CreateMaterialScreen({ navigation }: any) {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('metre');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any[]>('/projects')
      .then((p) => {
        setProjects(p);
        setProjectId(p[0]?.id || '');
      })
      .catch(() => undefined);
  }, []);

  const submit = async () => {
    const qty = Number(quantity);
    if (!materialName.trim() || !qty || !projectId) {
      Alert.alert('Required', 'Material, quantity, and project needed');
      return;
    }
    setBusy(true);
    const body = {
      projectId,
      materialName: materialName.trim(),
      quantity: qty,
      unit: unit.trim() || 'unit',
      urgency: 'normal',
    };
    try {
      await api('/materials', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Requested', 'Material request sent');
      navigation.goBack();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueMutation('/materials', 'POST', body);
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
        <Title>Request materials</Title>
        <Subtitle>Or ask KaamSetu by voice</Subtitle>
        <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        <Field
          label="Material"
          value={materialName}
          onChangeText={setMaterialName}
          placeholder="Copper cable"
        />
        <Field label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="20" />
        <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="metre" />
        <PrimaryButton label={busy ? 'Submitting…' : 'Submit request'} onPress={submit} disabled={busy} />
      </ScrollView>
    </Screen>
  );
}
