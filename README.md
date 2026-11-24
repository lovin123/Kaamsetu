# KaamSetu

Voice-first workforce coordination for India field workers (Hindi, Marathi, Hinglish, English).

## Stack

| Layer | Tech |
| --- | --- |
| Mobile | Expo Dev Client, React Native, TypeScript, React Navigation |
| Denoise | Kaleyra DeepFilterNet (JNI) → Android `NoiseSuppressor` → raw PCM |
| API | NestJS, Prisma, PostgreSQL, REST, Socket.IO |
| AI | Sarvam Saaras v4 / Bulbul / Translate + xAI Grok tools |
| Media / Push | Cloudinary, Firebase Cloud Messaging |

## Quick start

```bash
cd KaamSetu
cp .env.example apps/api/.env
# Add SARVAM_API_KEY, XAI_API_KEY, Cloudinary, Firebase into apps/api/.env

npm install
npm run db:up          # Postgres on localhost:5433
npm run prisma:migrate
npm run prisma:seed
npm run api            # http://localhost:3000/api
```

### Mobile (Android)

```bash
cd apps/mobile
npx expo prebuild --platform android
npx expo run:android   # needs JDK 17 + Android SDK
```

Without a native build, `expo start` still runs UI; voice capture falls back to `expo-av` (no DeepFilterNet). Profile → **Audio denoise PoC** validates the native chain.

### Seed logins

| Role | Phone | Password |
| --- | --- | --- |
| Worker | 9000000001 | password123 |
| Worker | 9000000002 | password123 |
| Supervisor | 9000000009 | password123 |

## Voice pipeline

1. Android mic → DeepFilterNet (or NS / raw)
2. Upload WAV → `POST /api/voice/audio`
3. Sarvam Saaras v4 transcription (`codemix`)
4. Grok structured `emit_voice_intent` tool call
5. Validated Nest domain services (never direct DB from LLM)
6. Confirmation gate when confidence is low
7. Sarvam Bulbul spoken reply + FCM/WebSocket notifications

Idempotency keys prevent duplicate mutations. Offline queue lives on device (`src/offline/queue.ts`).

## Monorepo

```
apps/api                 NestJS backend
apps/mobile              Expo app + kaamsetu-audio native module
packages/shared          Zod intent schemas + roles
docs/DEEPFILTERNET.md    Native denoise notes
```

## API map

- `POST /api/auth/login`
- `GET /api/projects` `GET /api/tasks` `PATCH /api/tasks/:id/progress`
- `POST /api/incidents` `POST /api/materials` `POST /api/blockers`
- `POST /api/voice/audio` `POST /api/voice/transcript` `POST /api/voice/confirm`
- `GET /api/summaries/daily` (supervisor)
- `GET /api/notifications`
- WS namespace `/realtime`