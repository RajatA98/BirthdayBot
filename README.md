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
- Local persistence for dev: file-backed store in `.tmp/birthdaybot-store`

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
```

Notes:

- If `OPENAI_API_KEY` is missing, the app falls back to mock planning and caption generation.
- If `FAL_KEY` is missing, the app falls back to a mock video-generation flow.

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
/api/download/[jobId]
```

This avoids the browser stalling on cross-origin provider asset URLs.

## Current Limitations

- Output quality still depends on prompt tuning and model behavior on real photos
- Local plan/job persistence is good for development, not production
- The app is still MVP-grade and focused on a narrow birthday-only flow

## Important Files

- [components/creation-form.tsx](./components/creation-form.tsx)
- [app/api/plan/route.ts](./app/api/plan/route.ts)
- [app/api/generate/route.ts](./app/api/generate/route.ts)
- [app/api/jobs/[jobId]/route.ts](./app/api/jobs/%5BjobId%5D/route.ts)
- [app/api/download/[jobId]/route.ts](./app/api/download/%5BjobId%5D/route.ts)
- [lib/plan-service.ts](./lib/plan-service.ts)
- [lib/video-service.ts](./lib/video-service.ts)
- [lib/tools](./lib/tools)

## Ops Notes

Project handoff and branch updates live in:

- [ops/HANDOFF_2026-05-09.md](./ops/HANDOFF_2026-05-09.md)
- [ops/updates](./ops/updates)
