# kaamsetu-audio

Expo native module: 48 kHz mono PCM16 capture → **Kaleyra DeepFilterNet** denoise → WAV.

## Kaleyra contract (verified against AAR 0.0.8 + official tests)

| Requirement | Our code |
|---|---|
| `NativeDeepFilterNet(context)` | `DeepFilterNetProcessor` |
| Wait for `onModelLoaded` before use | `CountDownLatch` (20s) |
| `setAttenuationLimit(30f)` after load | yes (checks boolean) |
| `frameLength` bytes, direct LE `ByteBuffer` | yes |
| `processFrame` in-place; SNR `< 0` = failure | yes |
| 48 kHz / 16-bit / mono | `VoiceRecorder` |
| Maven dep (not `files(aar)` alone) | `api '…:0.0.8'` + coroutines |

Official loader pattern:  
https://github.com/KaleyraVideo/AndroidDeepFilterNet/blob/main/app/src/main/java/com/kaleyra/androiddeepfilternet/filter/DeepFilterNetLoader.kt

## Build

```bash
npm run verify:deepfilternet   # AAR checksum + static API checks
npm run mobile:android         # Dev Client rebuild (required for native changes)
```

On device: **Profile → Audio denoise PoC** → `modeUsed=deepfilternet`, `fellBack=false`.  
Logcat: `KaamSetuDFN: DeepFilterNet ready frameLength=…`
