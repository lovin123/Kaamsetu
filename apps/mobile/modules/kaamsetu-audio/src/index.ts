import { Platform } from 'react-native';
import type { DenoiseMode } from '@kaamsetu/shared';

type AudioNativeModule = {
  startRecording: (
    mode: DenoiseMode,
  ) => Promise<{ mode: DenoiseMode; sampleRate: number }>;
  stopRecording: () => Promise<{
    uri: string;
    durationMs: number;
    modeUsed: DenoiseMode;
    fellBack: boolean;
  }>;
  getActiveMode: () => string;
  isAvailable: () => boolean;
};

let NativeAudio: AudioNativeModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireNativeModule } = require('expo-modules-core');
  NativeAudio = requireNativeModule('KaamSetuAudio');
} catch {
  NativeAudio = null;
}

const LINKING_ERROR =
  'KaamSetuAudio native module is not linked. Use Expo Dev Client / expo run:android.';

export const KaamSetuAudio = {
  isNativeAvailable() {
    return Platform.OS === 'android' && !!NativeAudio;
  },
  async isAvailable() {
    if (!NativeAudio) return false;
    return !!NativeAudio.isAvailable();
  },
  async startRecording(mode: DenoiseMode = 'deepfilternet') {
    if (!NativeAudio) throw new Error(LINKING_ERROR);
    return NativeAudio.startRecording(mode);
  },
  async stopRecording() {
    if (!NativeAudio) throw new Error(LINKING_ERROR);
    return NativeAudio.stopRecording();
  },
  async getActiveMode() {
    if (!NativeAudio) return 'off' as DenoiseMode;
    return NativeAudio.getActiveMode() as DenoiseMode;
  },
};
