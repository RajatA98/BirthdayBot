# Ops Update

- Date: 2026-05-10
- Branch: merge-main-voice-fix → main
- Commit: 817d1bc

## Summary

Merging this branch into main and shipping to production via Vercel's
GitHub integration. Branch carries:

- Phase A TTS quality leap (eleven_v3 + audio tags + tuned voice settings)
- Server-side speech-to-speech (Voice Changer) and the speak-yourself UI
- "Sing it" mode (AI-generated birthday song instead of narration)
- Auto-retry uses a safer fal prompt (smaller, lower cfg, no user prompt)
- Surfaced fal API error body in failed JobRecord.error so 422s no longer
  read as opaque "Unprocessable Entity"
- Hard 2400-char prompt cap before submit (kling enforces 2500; older v3
  caps at 512 — staying under both)
- No in-frame text: fal is instructed to keep every frame text-free; the
  HTML overlay handles the "Happy Birthday {Name}" title, voice carries
  the message
- IDENTITY LOCK guardrail in the prompt + expanded negative_prompt to stop
  subject swaps mid-shot
- Editable birthday message on review screen + shorter default copy

## Blockers Or Risks

- Production deploy: env vars (FAL_KEY, OPENAI_API_KEY, LANGFUSE_*,
  FAL_VIDEO_MODEL, OPENAI_*_MODEL) populated on Vercel production tier.
  ELEVENLABS_API_KEY is NOT in local .env; voice path falls back to
  stock voice if the prod env doesn't have it either.

## Next Context

Vercel project: rajata98s-projects/birthdaybot (linked from local).
Production deploys auto-trigger on push to main via Vercel's GitHub
integration on RajatA98/BirthdayBot.
