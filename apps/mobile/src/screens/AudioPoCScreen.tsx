import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { DenoiseMode } from '@kaamsetu/shared';
import { Audio } from 'expo-av';
import { KaamSetuAudio } from '../native/KaamSetuAudio';
import {
  Card,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';

/**
 * DeepFilterNet proof-of-concept screen:
 * record with deepfilternet / android_ns / off and report active engine + fallback.
 */
export function AudioPoCScreen() {
  const c = useThemeColors();
  const [mode, setMode] = useState<DenoiseMode>('deepfilternet');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('Ready');
  const native = KaamSetuAudio.isNativeAvailable();

  const cycle = () => {
    const order: DenoiseMode[] = ['deepfilternet', 'android_ns', 'off'];
    setMode(order[(order.indexOf(mode) + 1) % order.length]);
  };

  const run = async () => {
    setBusy(true);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Mic permission denied');
      if (!native) {
        setLog('Native KaamSetuAudio missing — build with expo run:android');
        return;
      }
      const started = await KaamSetuAudio.startRecording(mode);
      setLog(`Recording with ${started.mode} @ ${started.sampleRate}Hz… speak for ~3s`);
      await new Promise((r) => setTimeout(r, 3000));
      const stopped = await KaamSetuAudio.stopRecording();
      setLog(
        `Saved ${stopped.uri}\nmodeUsed=${stopped.modeUsed}\nfellBack=${stopped.fellBack}\ndurationMs=${stopped.durationMs}`,
      );
    } catch (err) {
      Alert.alert('PoC failed', (err as Error).message);
      setLog((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Audio PoC</Title>
      <Subtitle>
        Benchmark DeepFilterNet → Android NoiseSuppressor → raw PCM on device.
      </Subtitle>
      <PrimaryButton label={`Mode: ${mode} (tap cycle)`} onPress={cycle} />
      <View style={{ height: 10 }} />
      <PrimaryButton
        label={busy ? 'Recording…' : 'Record 3 seconds'}
        onPress={run}
        disabled={busy}
      />
      <Card>
        <Text style={{ color: c.muted }}>Native linked: {native ? 'yes' : 'no'}</Text>
        <Text style={{ color: c.ink, marginTop: 8 }}>{log}</Text>
      </Card>
    </Screen>
  );
}