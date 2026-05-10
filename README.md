# BirthdayBot

`BirthdayBot` is a mobile-first `Next.js` app that turns one shared photo and a short user prompt into:

- a cinematic birthday video
- a matching birthday caption
- a visible agent plan before generation

The product is built as a bounded agent workflow rather than a free-form chatbot. The backend analyzes the uploaded photo, creates a director-style generation plan, starts an async `fal` video job, monitors progress, and returns a result the user can preview and download.

## Current Flow

1. Upload one photo containing the people to animate
2. Enter a short birthday-video prompt
3. Review the generated agent plan and caption
4. Start video generation
5. Watch progress states
6. Preview, download, regenerate, or start a new video

## Stack

- Frontend: `Next.js`
- Backend: `Next.js` Route Handlers
- Planning and caption generation: `OpenAI`
- Video generation: `fal`
- Persistence: none on the server. Plan and job state live in the browser via `localStorage` and round-trip on each API call.

## Core Tools

The backend currently uses four core tools:

- `analyze_photo`
- `plan_birthday_video`
- `start_video_generation`
- `check_video_generation`

These live in [lib/tools](./lib/tools).

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Create a local `.env` file in the repo root:

```env
OPENAI_API_KEY=
OPENAI_PLAN_MODEL=gpt-4.1-mini
OPENAI_CAPTION_MODEL=gpt-4.1-mini

FAL_KEY=
FAL_VIDEO_MODEL=fal-ai/kling-video/v3/standard/image-to-video

ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
USE_AI_MUSIC=

LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

Notes:

- If `OPENAI_API_KEY` is missing, the app falls back to mock planning and caption generation.
- If `FAL_KEY` is missing, the app falls back to a mock video-generation flow.
- `FAL_VIDEO_MODEL` should stay on `fal-ai/kling-video/v3/standard/image-to-video` unless the team is intentionally testing a different endpoint.
- `ELEVENLABS_API_KEY` powers both voice cloning and the AI-generated background music bed. Without it, the mux step uses `public/audio/party-music.mp3` (or a synthetic lavfi tone if that file is missing).
- `USE_AI_MUSIC` overrides the AI music behavior: set `true` to force-on, `false` to force-off. If unset, AI music is automatically enabled whenever `ELEVENLABS_API_KEY` is present, with safe fallback to the static file on any failure.
- Stock narration voice is auto-picked from the agent plan's `narrationVoiceCue` field (e.g. "warm Punjabi-accented male, mid-energy"). The default ElevenLabs voice library is English-American, so for authentic non-English accents add voices from the EL voice library to your account and configure these env vars: `ELEVENLABS_VOICE_SPANISH`, `ELEVENLABS_VOICE_INDIAN`, `ELEVENLABS_VOICE_KOREAN`, `ELEVENLABS_VOICE_JAPANESE`, `ELEVENLABS_VOICE_AFRICAN`, `ELEVENLABS_VOICE_ARABIC`, `ELEVENLABS_VOICE_MANDARIN`, `ELEVENLABS_VOICE_BRITISH`, `ELEVENLABS_VOICE_AUSTRALIAN`. Set `ELEVENLABS_STOCK_VOICE_ID` to force a specific stock voice regardless of the cue.
- `Langfuse` is optional but recommended for tracing prompt decisions, timings, retries, and provider outcomes during real-photo testing.

## Testing

Run tests:

```bash
npm test
```

Run a production build check:

```bash
npm run build
```

## Download Behavior

Video downloads are handled through an app-owned proxy route:

```text
/api/download?url=<videoUrl>&name=<filename>
```

This avoids the browser stalling on cross-origin provider asset URLs. The route validates that the upstream host belongs to the fal.ai allow-list (`fal.ai`, `*.fal.media`, `*.fal.run`).

## Current Limitations

- Output quality still depends on prompt tuning and model behavior on real photos
- The app is still MVP-grade and focused on a narrow birthday-only flow
- Server-side state is intentionally absent: jobs live in the user's browser. Cross-device continuity needs auth + a real DB.

## Important Files

- [components/creation-form.tsx](./components/creation-form.tsx)
- [app/api/plan/route.ts](./app/api/plan/route.ts)
- [app/api/generate/route.ts](./app/api/generate/route.ts)
- [app/api/jobs/check/route.ts](./app/api/jobs/check/route.ts)
- [app/api/download/route.ts](./app/api/download/route.ts)
- [lib/plan-service.ts](./lib/plan-service.ts)
- [lib/video-service.ts](./lib/video-service.ts)
- [lib/tools](./lib/tools)

## Ops Notes

Project handoff and branch updates live in:

- [ops/HANDOFF_2026-05-09.md](./ops/HANDOFF_2026-05-09.md)
- [ops/updates](./ops/updates)
