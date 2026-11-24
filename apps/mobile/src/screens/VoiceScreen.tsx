import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type { DenoiseMode } from '@kaamsetu/shared';
import { api, isNetworkError } from '../api/client';
import { KaamSetuAudio } from '../native/KaamSetuAudio';
import {
  Card,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';
import { enqueueVoiceAudio } from '../offline/queue';

type VoiceState = 'idle' | 'recording' | 'processing' | 'confirm';
const CONV_KEY = 'kaamsetu_conversation_id';

export function VoiceScreen() {
  const c = useThemeColors();
  const [state, setState] = useState<VoiceState>('idle');
  const [mode, setMode] = useState<DenoiseMode>('deepfilternet');
  const [activeMode, setActiveMode] = useState<string>('—');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const native = KaamSetuAudio.isNativeAvailable();

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(CONV_KEY);
      if (saved) setConversationId(saved);
      try {
        const projects = await api<any[]>('/projects');
        setProjectId(projects[0]?.id);
      } catch {
        // ignore
      }
    })();
  }, []);

  const rememberConversation = async (id?: string) => {
    if (!id) return;
    setConversationId(id);
    await AsyncStorage.setItem(CONV_KEY, id);
  };

  const cycleMode = () => {
    const order: DenoiseMode[] = ['deepfilternet', 'android_ns', 'off'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setMode(next);
  };

  const playTts = async (base64: string) => {
    const path = `${FileSystem.cacheDirectory}reply-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: path });
    await sound.playAsync();
  };

  const start = async () => {
    setTranscript('');
    setReply('');
    setActionId(null);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required');
        return;
      }
      if (native) {
        const started = await KaamSetuAudio.startRecording(mode);
        setActiveMode(started.mode);
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        await recording.startAsync();
        recordingRef.current = recording;
        setActiveMode('expo-av (no native denoise)');
      }
      setState('recording');
    } catch (err) {
      Alert.alert('Record failed', (err as Error).message);
    }
  };

  const stopAndSend = async () => {
    setState('processing');
    let uri = '';
    let uploadName = 'voice.wav';
    let uploadType = 'audio/wav';
    try {
      if (native) {
        const result = await KaamSetuAudio.stopRecording();
        uri = result.uri;
        setActiveMode(
          result.fellBack
            ? `${result.modeUsed} (fallback)`
            : result.modeUsed,
        );
      } else {
        const recording = recordingRef.current;
        if (!recording) throw new Error('No recording');
        await recording.stopAndUnloadAsync();
        uri = recording.getURI() || '';
        recordingRef.current = null;
        // expo-av HIGH_QUALITY is typically AAC/m4a on Android
        uploadName = 'voice.m4a';
        uploadType = 'audio/m4a';
      }
      if (!uri) throw new Error('No audio file');

      const form = new FormData();
      form.append('audio', {
        uri,
        name: uploadName,
        type: uploadType,
      } as any);
      if (projectId) form.append('projectId', projectId);
      if (conversationId) form.append('conversationId', conversationId);
      form.append('idempotencyKey', `voice-${Date.now()}`);

      const result = await api<any>('/voice/audio', {
        method: 'POST',
        body: form,
      });
      setTranscript(result.transcript || '');
      setReply(result.replyText || '');
      await rememberConversation(result.conversationId);
      if (result.ttsAudioBase64) {
        await playTts(result.ttsAudioBase64);
      }
      if (result.status === 'needs_confirmation') {
        setActionId(result.actionId);
        setState('confirm');
      } else {
        setState('idle');
      }
    } catch (err) {
      const message = (err as Error).message;
      if (uri && isNetworkError(err)) {
        await enqueueVoiceAudio({
          audioUri: uri,
          audioName: uploadName,
          audioType: uploadType,
          projectId,
          conversationId,
        }).catch(() => undefined);
        Alert.alert(
          'Queued for sync',
          `Voice upload failed and was queued offline.\n${message}`,
        );
      } else {
        Alert.alert('Voice failed', message);
      }
      setState('idle');
    }
  };

  const confirm = async () => {
    if (!actionId) return;
    setState('processing');
    try {
      const result = await api<any>('/voice/confirm', {
        method: 'POST',
        body: JSON.stringify({ actionId }),
      });
      setReply(result.replyText || 'Confirmed');
      await rememberConversation(result.conversationId);
      if (result.ttsAudioBase64) {
        await playTts(result.ttsAudioBase64);
      }
      setState('idle');
      setActionId(null);
    } catch (err) {
      Alert.alert('Confirm failed', (err as Error).message);
      setState('idle');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Title>Voice assistant</Title>
        <Subtitle>
          Tap the mic and speak naturally. Denoise: DeepFilterNet → Android NS → raw.
        </Subtitle>

        <Pressable onPress={cycleMode} style={{ marginTop: 12 }}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>
            Mode: {mode} · Active: {activeMode}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            Tap to cycle modes · Native module: {native ? 'yes' : 'no (expo-av fallback)'}
          </Text>
        </Pressable>

        <View style={styles.micWrap}>
          <Pressable
            onPress={state === 'recording' ? stopAndSend : start}
            disabled={state === 'processing'}
            style={[
              styles.mic,
              {
                backgroundColor:
                  state === 'recording' ? c.micActive : c.micIdle,
                opacity: state === 'processing' ? 0.6 : 1,
              },
            ]}
          >
            <Text style={styles.micLabel}>
              {state === 'recording'
                ? 'Stop'
                : state === 'processing'
                  ? '…'
                  : 'Mic'}
            </Text>
          </Pressable>
          <Text style={{ color: c.muted, marginTop: 12 }}>
            {state === 'idle' && 'Tap to speak'}
            {state === 'recording' && 'Listening… tap to finish'}
            {state === 'processing' && 'Understanding…'}
            {state === 'confirm' && 'Confirm required'}
          </Text>
        </View>

        {!!transcript && (
          <Card>
            <Text style={{ color: c.muted, fontWeight: '600' }}>You said</Text>
            <Text style={{ color: c.ink, marginTop: 6, fontSize: 16 }}>{transcript}</Text>
          </Card>
        )}
        {!!reply && (
          <Card>
            <Text style={{ color: c.muted, fontWeight: '600' }}>KaamSetu</Text>
            <Text style={{ color: c.ink, marginTop: 6, fontSize: 16 }}>{reply}</Text>
          </Card>
        )}
        {state === 'confirm' && (
          <PrimaryButton label="Confirm action" onPress={confirm} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  micWrap: { alignItems: 'center', marginVertical: 28 },
  mic: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micLabel: { color: '#fff', fontSize: 28, fontWeight: '800' },
});