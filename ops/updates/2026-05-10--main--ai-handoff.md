# Ops Update — AI Handoff

- Date: 2026-05-10
- Branch: main
- Commit: 3c0103b (at time of writing)

## Read this if you are an AI agent picking this project up cold

This file is a self-contained briefing so you do not have to reverse-engineer
the codebase from scratch. Read this first, then `lib/CLAUDE.md`-style
files do not exist here — instead, see [README.md](../../README.md) and the
files referenced below.

## What this project is

`BirthdayBot` is a Next.js 15 app that turns ONE uploaded photo + a short
prompt into a cinematic birthday video with a personalized voice-over (and
optional sung birthday song). It is mobile-first and stateless on the
server — all job state lives in the user's browser via `localStorage` and
round-trips on every API call.

## Live URLs

- Production: https://birthdaybot-five.vercel.app
- Vercel project: `rajata98s-projects/birthdaybot`
- GitHub: https://github.com/RajatA98/BirthdayBot
- Vercel auto-deploys `main` to production via the GitHub integration.
  Every push to `main` triggers a fresh production build.

## Pipeline at a glance

```
upload photo + prompt
        │
        ▼
[POST /api/plan]  ──── analyze_photo + plan_birthday_video (OpenAI)
        │                returns {plan, caption}
        ▼
review screen (user can edit caption/birthday name/voice mode)
        │
        ▼
[POST /api/generate]  ── start_video_generation:
        │                  - upload photo to fal storage
        │                  - createVoiceOver via ElevenLabs (TTS or S2S)
        │                  - generate music bed (instrumental or full song)
        │                  - submit fal queue job
        │                returns JobRecord with providerRequestId
        ▼
poll [POST /api/jobs/check] every few seconds
        │                  - fal.queue.status → fal.queue.result
        │                  - if 422 / fail: ONE auto-retry with safeRetry
        │                    payload (lower cfg, no user prompt, minimal
        │                    negative prompt)
        │                  - on COMPLETED: download video, mux voice +
        │                    music via ffmpeg-static, upload result back
        │                    to fal storage
        ▼
result screen with HTML overlay "Happy Birthday {Name}" + voice + download
```

Core tools all live in [lib/tools](../../lib/tools):
- `analyze-photo.ts` — OpenAI vision call to extract identity anchors
- `plan-birthday-video.ts` — OpenAI structured plan + caption
- `start-video-generation.ts` — kicks off fal job + parallel voice/music gen
- `check-video-generation.ts` — polling, retry, mux orchestration
- `build-video-input.ts` — fal prompt assembly + safeRetry payload
- `create-voice-over.ts` — ElevenLabs IVC clone, TTS, speech-to-speech
- `generate-music-bed.ts` — ElevenLabs Music API + birthday-song mode
- `mux-voice-over.ts` — ffmpeg muxing (sidechain ducking + loudnorm)

## Voice modes (DraftRequest.voiceMode)

- `narrate` (default) — ElevenLabs TTS narrates the generated caption,
  ducked party music underneath
- `speak-yourself` — user records their own birthday message, ElevenLabs
  Voice Changer (S2S) preserves their prosody but polishes delivery
- `song` — ElevenLabs Music API generates an actual sung birthday song
  in the chosen style (Mariachi / Bhangra / Lo-fi / Gospel / 80s power
  ballad / Acoustic). Replaces narration AND ambient music.

## State of the prompt pipeline (load-bearing)

These are the guardrails currently shipping to fal. Don't undo them
without understanding why they exist:

- **2400-char prompt cap** in `buildFalPrompt`. Fal/kling rejects prompts
  > 2500; older v3 builds capped at 512. Capping pre-emptively avoids the
  422 we used to surface as "Unprocessable Entity" with no detail.
- **No in-frame text directive** — fal renders garbled gibberish when
  asked to embed long captions. The "Happy Birthday {Name}" title is now
  an HTML overlay (creation-form.tsx ResultVideo), and the voice-over
  carries the message. Negative prompt actively suppresses on-screen
  text/captions/lower-thirds/etc.
- **IDENTITY LOCK** — explicit instruction at the top of the prompt that
  on-screen subjects must remain the source-photo people across every
  shot/transition. Negative prompt suppresses "different people /
  replacement actors / body double / stock-footage people / subject swap
  during transition." Stops kling's tendency to swap subjects on cuts.
- **safeRetry path** — on first failure, retry uses a stripped-down
  payload: drops the verbose user-prompt layer, lowers `cfg_scale` from
  0.65 → 0.5, minimal negative prompt. Plus the plan's `safePrompt` and
  identity guardrails. See `BuildFalOptions` in `build-video-input.ts`.

## Error surfacing

`providerFailureMessage` in `check-video-generation.ts` parses fal
`ApiError.body.detail` (FastAPI/Pydantic `[{loc, msg, type}]` array) so
422s now read like:
`"Unprocessable Entity (422): prompt: ensure this value has at most 512 characters"`
instead of the bare `"Unprocessable Entity"`. The detail lives on
`JobRecord.error` in the polling response — UI surfaces `statusMessage`
on the failure card.

## Environment (production tier on Vercel)

These are populated:
- `OPENAI_API_KEY`, `OPENAI_PLAN_MODEL`, `OPENAI_CAPTION_MODEL`
- `FAL_KEY`, `FAL_VIDEO_MODEL` (default `fal-ai/kling-video/v3/standard/image-to-video`)
- `ELEVENLABS_API_KEY`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`

Optional, NOT set on production but recognized by the code:
- `ELEVENLABS_TTS_MODEL` (default `eleven_v3`)
- `ELEVENLABS_STS_MODEL` (default `eleven_multilingual_sts_v2`)
- `ELEVENLABS_STOCK_VOICE_ID` (override stock voice)
- `ELEVENLABS_VOICE_{SPANISH,INDIAN,KOREAN,JAPANESE,AFRICAN,ARABIC,MANDARIN,BRITISH,AUSTRALIAN}` —
  per-cue cultural-accent voice IDs
- `USE_AI_MUSIC` — force-on/off the AI music bed

Local `.env` mirrors the production set. Treat `.env` as untracked
(gitignored). Audit performed 2026-05-10 confirmed no secrets in tracked
files or git history.

## Tests

- `npm test` — Vitest, currently 48 tests across 9 files
- `npx tsc --noEmit` — strict typecheck
- `npm run build` — Next production build (also what Vercel runs)

Notable test files:
- `tests/video-service.test.ts` — covers `buildFalPrompt`/`buildFalInput`
  including the safeRetry contract; ALSO covers the voice pipeline
  (TTS, IVC consent, S2S speak-yourself)
- `tests/creation-form.test.tsx` — React Testing Library coverage of
  the multi-step UI flow

## Conventions to respect

- **No server-side state.** Job and plan records round-trip through the
  client. Don't add a DB without a load-bearing reason.
- **Pre-push hook generates an ops update.** When you push, expect a new
  file under `ops/updates/` to be auto-staged. Fill in the Summary /
  Blockers / Next Context sections before re-pushing — the hook blocks
  empty templates.
- **No `Co-Authored-By` lines on commits.** Sole-author convention here.
- **Use the existing tool boundaries.** The pipeline phases are clean
  for a reason; each tool in `lib/tools/` should remain independently
  testable.

## What to do next if you're picking this up

1. Read this file, then [README.md](../../README.md), then skim
   [lib/tools/check-video-generation.ts](../../lib/tools/check-video-generation.ts) — that's the
   load-bearing orchestration.
2. `npm install && npm test` to confirm the local environment works.
3. `npm run dev` and try the speak-yourself flow end-to-end — that's
   the most product-distinctive surface and exercises the most pipeline.
4. Watch Langfuse traces during real runs — every tool call, retry,
   and timing emits events.
