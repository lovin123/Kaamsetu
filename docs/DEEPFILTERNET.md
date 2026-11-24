# DeepFilterNet Android integration

## Primary

- Library: [KaleyraVideo/AndroidDeepFilterNet](https://github.com/KaleyraVideo/AndroidDeepFilterNet) (Apache-2.0)
- Maven: `io.github.kaleyravideo:android-deepfilternet`
- Format: 48 kHz mono 16-bit PCM, JNI `processFrame`

## Fallback chain

1. DeepFilterNet (requested / default)
2. `android.media.audiofx.NoiseSuppressor` on `AudioRecord` session
3. Raw PCM if NS unavailable

One engine active at a time. Modes from JS: `deepfilternet` | `android_ns` | `off`.

## Module location

`apps/mobile/modules/kaamsetu-audio` — Expo native module `KaamSetuAudio`.

## Build

Requires JDK 17 + Android SDK:

```bash
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android
```

Open Profile → Audio denoise PoC to verify capture, active mode, and fallback flags.