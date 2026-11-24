# DeepFilterNet AAR (required)

`android-deepfilternet-0.0.8.aar` must live in this folder so every Android
build compiles against Kaleyra DeepFilterNet and packages `libdf.so` + the
bundled model into the APK.

Restore if missing:

```bash
npm run ensure:deepfilternet
```

Or from the monorepo root / `apps/mobile` before `expo run:android`
(the `preandroid` / `prebuild` scripts already call this).
