import React, { useEffect, useRef, useState } from 'react';
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
 * DeepFilterNet proof-of-concept screen (dev builds).
 */
export function AudioPoCScreen() {
  const c = useThemeColors();
  const [mode, setMode] = useState<DenoiseMode>('deepfilternet');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('Ready');
  const native = KaamSetuAudio.isNativeAvailable();
  const recordingActive = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recordingActive.current) {
        KaamSetuAudio.stopRecording().catch(() => undefined);
        recordingActive.current = false;
      }
    };
  }, []);

  const cycle = () => {
    const order: DenoiseMode[] = ['deepfilternet', 'android_ns', 'off'];
    setMode(order[(order.indexOf(mode) + 1) % order.length]);
  };

  const run = async () => {
    setBusy(true);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Mic permission denied');
      if (mode === 'deepfilternet') {
        await KaamSetuAudio.assertDeepFilterNetReady();
      } else if (!KaamSetuAudio.isNativeAvailable()) {
        throw new Error('Native KaamSetuAudio missing — build with expo run:android');
      }
      const started = await KaamSetuAudio.startRecording(mode);
      recordingActive.current = true;
      if (mounted.current) {
        setLog(
          `Recording with ${started.mode} @ ${started.sampleRate}Hz (DFN classpath=${started.deepFilterNetOnClasspath})… speak for ~3s`,
        );
      }
      await new Promise((r) => setTimeout(r, 3000));
      if (!recordingActive.current) return;
      const stopped = await KaamSetuAudio.stopRecording();
      recordingActive.current = false;
      if (mounted.current) {
        setLog(
          `Saved ${stopped.uri}\nmodeUsed=${stopped.modeUsed}\nfellBack=${stopped.fellBack}\ndurationMs=${stopped.durationMs}`,
        );
      }
    } catch (err) {
      recordingActive.current = false;
      if (mounted.current) {
        Alert.alert('PoC failed', (err as Error).message);
        setLog((err as Error).message);
      }
    } finally {
      if (mounted.current) setBusy(false);
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
