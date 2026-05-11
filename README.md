# BirthdayBot

`BirthdayBot` is a mobile-first `Next.js` app that turns one shared photo and a short user prompt into:

- a cinematic birthday video with a personalized voice-over
- a matching birthday caption
- a visible agent plan the user can edit before generation

The product is built as a bounded agent workflow rather than a free-form chatbot. The backend analyzes the uploaded photo, creates a director-style generation plan, starts an async `fal` video job, monitors progress, muxes voice + music with `ffmpeg`, and returns a result the user can preview and download.

**Live deploy:** <https://birthdaybot-five.vercel.app>
**Latest commit on `main`:** [`9e20b12`](https://github.com/RajatA98/BirthdayBot/commit/9e20b12) — `Stop muxed video from cutting off when voice-over ends`

## Current Flow

1. Upload one photo containing the people to animate, enter the birthday person's name, write a short prompt
2. Pick a voice mode: **narrate** (default), **speak-yourself** (record your own message and route it through ElevenLabs Voice Changer), or **sing-it** (an AI-generated birthday song in the style of your choice)
3. Optionally upload a voice sample for cloning (with explicit consent), or let the agent pick a stock voice from the plan's `narrationVoiceCue`
4. Review the generated plan + caption + birthday name on the editable review screen
5. Start video generation — fal video, voice-over, and music bed kick off in parallel
6. Watch progress states with live provider logs; one auto-retry with a safer payload happens silently on failure
7. Preview the final muxed video with an HTML "Happy Birthday {Name}" overlay, download, regenerate, or start a new video

## Stack

- Frontend: `Next.js` 15 (React 19) — mobile-first
- Backend: `Next.js` Route Handlers (Node runtime)
- Planning and caption generation: `OpenAI` (Responses API, structured output)
- Video generation: `fal` (default endpoint: `fal-ai/kling-video/v3/standard/image-to-video`)
- Voice cloning, TTS, and Voice Changer (S2S): `ElevenLabs` (default model `eleven_v3`)
- AI music bed and birthday-song mode: `ElevenLabs` Music API
- Final mux: `ffmpeg-static` with sidechain ducking + `loudnorm` to -16 LUFS
- Observability: `Langfuse` (optional)
- Hosting: `Vercel` — `main` auto-deploys to production
- Persistence: none on the server. Plan and job state live in the browser via `localStorage` and round-trip on each API call.

## Core Tools

The backend pipeline lives in [lib/tools](./lib/tools):

- `analyze_photo` — vision call to extract identity anchors from the photo
- `plan_birthday_video` — structured generation plan + caption
- `start_video_generation` — uploads the photo, starts the fal job, kicks off voice-over and music in parallel
- `check_video_generation` — polls fal, surfaces the underlying API error body on failure, auto-retries once with a safer payload, and orchestrates the final ffmpeg mux
- `build_video_input` — fal prompt assembly, 2400-char hard cap, IDENTITY-LOCK guardrail, no-text-in-frame directive, and the `safeRetry` payload variant
- `create_voice_over` — ElevenLabs IVC clone (with consent), TTS, and speech-to-speech for `speak-yourself`
- `generate_music_bed` — instrumental music bed or full sung birthday song
- `mux_voice_over` — ffmpeg muxing for narration + ducked music (and a separate path for song mode)

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

Copy the committed template, fill in your secrets, and you're set:

```bash
cp .env.example .env
```

Then edit `.env` and paste in the three keys you actually need
(`OPENAI_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`). Everything else has
a working default in code. `.env.example` is the source of truth for the
full var list — required vs optional, what each one does, and what
happens when it's absent. After filling in:

```bash
npx tsx scripts/api-check.ts
```

verifies every provider's account/capability endpoint is reachable.

Quick reference (full notes live in [.env.example](./.env.example)):

- **Required** — `OPENAI_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`. If
  `OPENAI_API_KEY` is missing the planner falls back to mock data; if
  `FAL_KEY` is missing the job fails explicitly (the stock-demo fallback
  was removed); if `ELEVENLABS_API_KEY` is missing voice cloning + AI
  music skip and the mux uses `public/audio/party-music.mp3`.
- **Model overrides** — `FAL_VIDEO_MODEL`, `OPENAI_PLAN_MODEL`,
  `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STS_MODEL`,
  `ELEVENLABS_STOCK_VOICE_ID`, `FAL_PROMPT_CHAR_LIMIT`.
- **Cultural voice slots** — `ELEVENLABS_VOICE_{SPANISH,INDIAN,KOREAN,
  JAPANESE,AFRICAN,ARABIC,MANDARIN,BRITISH,AUSTRALIAN}` for authentic
  non-English accents (default catalog is English-American).
- **Music mode** — `USE_AI_MUSIC=true|false` to force-on or force-off
  the AI music bed.
- **Observability** — `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`,
  `LANGFUSE_BASE_URL`. Optional but recommended for tracing prompts,
  retries, and provider outcomes.
- **Email delivery (Resend)** — `RESEND_API_KEY`, `EMAIL_FROM` /
  `BIRTHDAYBOT_EMAIL_FROM`, `BIRTHDAYBOT_PUBLIC_URL`. Without these the
  email send route returns a clean 503 and download is the only share
  path.

## Prompt-pipeline guardrails

These are load-bearing — read [lib/tools/build-video-input.ts](./lib/tools/build-video-input.ts) before changing prompt assembly:

- **2400-char hard cap** on the fal prompt before submit. Fal/kling rejects prompts > 2500; older v3 builds capped at 512.
- **No in-frame text** — fal renders garbled gibberish when asked to embed long captions. The "Happy Birthday {Name}" title is now an HTML overlay (rendered by `ResultVideo` in `components/creation-form.tsx`), the voice carries the message, and the negative prompt actively suppresses on-screen text/captions/lower-thirds.
- **IDENTITY LOCK** — explicit instruction at the top of the fal prompt that on-screen subjects must remain the source-photo people across every shot/transition. Negative prompt suppresses subject swaps and stock-actor replacements.
- **safeRetry** — on first failure, `/api/jobs/check` automatically retries once with a stripped-down payload (drops the verbose user-prompt layer, lowers `cfg_scale` from 0.65 → 0.5, minimal negative prompt). Only the plan's `safePrompt` and identity guardrails remain.
- **Surfaced provider errors** — when fal returns a 422 at `queue.result()` time, `JobRecord.error` now carries the parsed `body.detail` (e.g. `"Unprocessable Entity (422): prompt: ensure this value has at most 512 characters"`) instead of opaque status text.

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

## Deployment

`main` auto-deploys to production via Vercel's GitHub integration on
[`RajatA98/BirthdayBot`](https://github.com/RajatA98/BirthdayBot). Project: `rajata98s-projects/birthdaybot`.

Manual production deploy from the local checkout:

```bash
vercel --prod
```

Inspect deploys:

```bash
vercel ls
```

## Ops Notes

Project handoff and branch updates live in:

- [ops/HANDOFF_2026-05-09.md](./ops/HANDOFF_2026-05-09.md)
- [ops/updates](./ops/updates) — most recent: [`2026-05-10--main--9903e76.md`](./ops/updates/2026-05-10--main--9903e76.md). **If you are an AI agent picking this project up, read that file first.**

Pre-push hook (installed via [scripts/install-git-hooks.sh](./scripts/install-git-hooks.sh)) auto-stages a new ops update on push and blocks empty templates — fill in Summary / Blockers / Next Context before re-pushing.
