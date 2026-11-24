import { Platform } from 'react-native';
import type { DenoiseMode } from '@kaamsetu/shared';

type AudioNativeModule = {
  startRecording: (
    mode: DenoiseMode,
  ) => Promise<{
    mode: DenoiseMode;
    sampleRate: number;
    deepFilterNetOnClasspath?: boolean;
  }>;
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
  'KaamSetuAudio native module is not linked. Rebuild the Android Dev Client with: npx expo run:android';

const DFN_MISSING =
  'DeepFilterNet is not packaged in this build. Run: npm run ensure:deepfilternet && npx expo run:android';

export const KaamSetuAudio = {
  isNativeAvailable() {
    return Platform.OS === 'android' && !!NativeAudio;
  },

  /** True when Kaleyra NativeDeepFilterNet class is inside the APK. */
  async isAvailable() {
    if (!NativeAudio) return false;
    return !!NativeAudio.isAvailable();
  },

  /**
   * Android voice must use DeepFilterNet. Throws if the Dev Client / AAR is missing
   * so we never silently record with expo-av (no denoise).
   */
  async assertDeepFilterNetReady() {
    if (Platform.OS !== 'android') {
      throw new Error('DeepFilterNet is Android-only');
    }
    if (!NativeAudio) {
      throw new Error(LINKING_ERROR);
    }
    if (!NativeAudio.isAvailable()) {
      throw new Error(DFN_MISSING);
    }
  },

  async startRecording(mode: DenoiseMode = 'deepfilternet') {
    if (!NativeAudio) throw new Error(LINKING_ERROR);
    if (Platform.OS !== 'android') {
      throw new Error('KaamSetuAudio recording is Android-only');
    }
    if (mode === 'deepfilternet') {
      await this.assertDeepFilterNetReady();
    }
    const started = await NativeAudio.startRecording(mode);
    if (mode === 'deepfilternet' && started.mode !== 'deepfilternet') {
      throw new Error(
        `DeepFilterNet did not activate (got ${started.mode}). Rebuild Dev Client with ensure:deepfilternet.`,
      );
    }
    return started;
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
