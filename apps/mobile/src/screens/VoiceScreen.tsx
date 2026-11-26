import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
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
import { ApiError, api, isNetworkError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { KaamSetuAudio } from '../native/KaamSetuAudio';
import {
  Card,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  useThemeColors,
} from '../components/ui';
import { ProjectPicker } from '../components/ProjectPicker';
import { enqueueVoiceAudio } from '../offline/queue';

type VoiceState = 'idle' | 'recording' | 'processing' | 'confirm';
type ProjectRow = { id: string; name?: string; code?: string };

function convKey(userId: string) {
  return `kaamsetu_conversation_id:${userId}`;
}

export function VoiceScreen() {
  const { user } = useAuth();
  const c = useThemeColors();
  const [state, setState] = useState<VoiceState>('idle');
  const [mode, setMode] = useState<DenoiseMode>('deepfilternet');
  const [activeMode, setActiveMode] = useState<string>('—');
  const [dfnReady, setDfnReady] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const idempotencyRef = useRef(`voice-${Date.now()}`);
  const native = KaamSetuAudio.isNativeAvailable();

  useEffect(() => {
    (async () => {
      if (user?.id) {
        const saved = await AsyncStorage.getItem(convKey(user.id));
        if (saved) setConversationId(saved);
      }
      try {
        const list = await api<ProjectRow[]>('/projects');
        setProjects(list);
        setProjectId((prev) => prev ?? list[0]?.id);
      } catch {
        // ignore
      }
      if (Platform.OS === 'android' && native) {
        setDfnReady(await KaamSetuAudio.isAvailable());
      }
    })();
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
      soundRef.current = null;
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
        recordingRef.current = null;
      }
    };
  }, [native, user?.id]);

  const rememberConversation = async (id?: string) => {
    if (!id || !user?.id) return;
    setConversationId(id);
    await AsyncStorage.setItem(convKey(user.id), id);
  };

  const clearConversation = async () => {
    setConversationId(undefined);
    if (user?.id) await AsyncStorage.removeItem(convKey(user.id));
  };

  const cycleMode = () => {
    const order: DenoiseMode[] = ['deepfilternet', 'android_ns', 'off'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setMode(next);
  };

  const playTts = async (base64: string) => {
    try {
      await soundRef.current?.unloadAsync();
    } catch {
      // ignore
    }
    soundRef.current = null;
    const path = `${FileSystem.cacheDirectory}reply-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: path });
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => undefined);
        if (soundRef.current === sound) soundRef.current = null;
        FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
      }
    });
    await sound.playAsync();
  };

  const startRecordingFlow = async () => {
    setTranscript('');
    setReply('');
    setActionId(null);
    idempotencyRef.current = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required');
        return;
      }

      if (Platform.OS === 'android') {
        if (mode === 'deepfilternet') {
          await KaamSetuAudio.assertDeepFilterNetReady();
        } else if (!KaamSetuAudio.isNativeAvailable()) {
          throw new Error(
            'KaamSetuAudio native module is not linked. Rebuild with: npx expo run:android',
          );
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const started = await KaamSetuAudio.startRecording(mode);
        setActiveMode(started.mode);
        if (started.mode === 'deepfilternet') setDfnReady(true);
        setState('recording');
        return;
      }

      // iOS: stop any lingering recording first
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
        recordingRef.current = null;
      }
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
      setActiveMode('expo-av (iOS — no DeepFilterNet)');
      setState('recording');
    } catch (err) {
      Alert.alert('Record failed', (err as Error).message);
      setState('idle');
    }
  };

  const start = async () => {
    if (state === 'confirm' && actionId) {
      Alert.alert(
        'Pending confirmation',
        'Confirm or discard the current voice action before recording again.',
        [
          { text: 'Keep waiting', style: 'cancel' },
          {
            text: 'Discard & record',
            style: 'destructive',
            onPress: () => {
              setActionId(null);
              setState('idle');
              startRecordingFlow();
            },
          },
        ],
      );
      return;
    }
    await startRecordingFlow();
  };

  const postVoice = async (
    uri: string,
    uploadName: string,
    uploadType: string,
    convId?: string,
  ) => {
    const form = new FormData();
    form.append('audio', {
      uri,
      name: uploadName,
      type: uploadType,
    } as any);
    if (projectId) form.append('projectId', projectId);
    if (convId) form.append('conversationId', convId);
    form.append('idempotencyKey', idempotencyRef.current);
    return api<any>('/voice/audio', { method: 'POST', body: form });
  };

  const stopAndSend = async () => {
    setState('processing');
    let uri = '';
    let uploadName = 'voice.wav';
    let uploadType = 'audio/wav';
    try {
      if (Platform.OS === 'android') {
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
        try {
          await recording.stopAndUnloadAsync();
          uri = recording.getURI() || '';
        } finally {
          recordingRef.current = null;
        }
        uploadName = 'voice.m4a';
        uploadType = 'audio/m4a';
      }
      if (!uri) throw new Error('No audio file');

      let result: any;
      try {
        result = await postVoice(uri, uploadName, uploadType, conversationId);
      } catch (err) {
        // Stale conversation → clear and retry once without it
        if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 400) &&
          conversationId
        ) {
          await clearConversation();
          result = await postVoice(uri, uploadName, uploadType, undefined);
        } else {
          throw err;
        }
      }

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
          idempotencyKey: idempotencyRef.current,
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

        {projects.length > 0 && projectId ? (
          <View style={{ marginTop: 16 }}>
            <ProjectPicker
              projects={projects}
              value={projectId}
              onChange={setProjectId}
            />
          </View>
        ) : null}

        <Pressable onPress={cycleMode} style={{ marginTop: 12 }}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>
            Mode: {mode} · Active: {activeMode}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            Tap to cycle modes · Native: {native ? 'yes' : 'no'} · DeepFilterNet:{' '}
            {Platform.OS !== 'android'
              ? 'n/a (iOS)'
              : dfnReady
                ? 'packaged'
                : 'missing — run npm run android'}
          </Text>
        </Pressable>

        {!!conversationId && (
          <Pressable onPress={clearConversation} style={{ marginTop: 8 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              Conversation active · tap to start new
            </Text>
          </Pressable>
        )}

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
