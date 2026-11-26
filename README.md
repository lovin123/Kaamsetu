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

### Roles (RBAC)

| Role | Access |
| --- | --- |
| **Worker** | Own tasks; report incidents / materials / blockers; join sites by project code |
| **Supervisor** | **Only assigned teams** — tasks, workforce, approvals, add workers to those teams |
| **Admin** | Org-wide: create teams/users, assign supervisors & workers, change roles |

#### Auth flows (no role picker)
1. **Register** → name + phone + OTP. Role is assigned automatically:
   - **No admin yet** → **Admin**
   - **Admin already exists** → **Worker**
2. **Login** → phone + OTP only. Role comes from the account (Admin / Supervisor / Worker).
3. **Supervisors** are never self-registered — Admin creates them under Users / Teams.
4. **Recovery admin** — optional only. Leave `ADMIN_BOOTSTRAP_*` unset unless you need a secret-gated first admin, boot-time admin phone, or recovery promote.

### Seed accounts (OTP — no password)

Enter 10-digit numbers in the app; API stores them as `91…`.

| Role | Phone (app) | Stored |
| --- | --- | --- |
| Admin | 9000000000 | 919000000000 |
| Supervisor | 9000000009 | 919000000009 |
| Worker | 9000000001 | 919000000001 |
| Worker | 9000000002 | 919000000002 |

Request an OTP in the app. SMS: set `OTP_SMS_PROVIDER=msg91` + keys (or Twilio). `console` logs OTP locally only.

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

- `POST /api/auth/otp/request` `POST /api/auth/otp/verify`
- `GET/POST /api/users` `PATCH /api/users/:id/role` (admin)
- `GET/POST /api/projects` `PATCH /api/projects/:id` (admin create/update)
- `GET/POST/DELETE /api/projects/:id/members` (admin or assigned supervisor)
- `GET /api/projects` `GET /api/tasks` `PATCH /api/tasks/:id/progress`
- `POST /api/incidents` `POST /api/materials` `POST /api/blockers`
- `POST /api/voice/audio` `POST /api/voice/transcript` `POST /api/voice/confirm`
- `GET /api/summaries/daily` (supervisor)
- `GET /api/notifications`
- WS namespace `/realtime`