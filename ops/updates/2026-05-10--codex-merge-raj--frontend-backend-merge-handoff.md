# Ops Update — frontend/backend merge handoff

- Date: 2026-05-10
- Branch: codex/merge-raj
- Commit: edf0854 at handoff time

## Summary

Merged the current `origin/main` backend into `codex/merge-raj` while preserving the new BirthdayBot dashboard UI.

Relevant commits now on this branch:

- `0dfd75c` merged the stateless `main` backend/tool architecture into the new UI branch.
- `edf0854` merged the latest `origin/main` update on top.
- `3838cf9` from `main` fixes the double-audio issue by bundling `ffmpeg-static` with `/api/jobs/check` and keeping fal native audio disabled.
- `6004619` from `main` adds frontend-merge guidance for future collaborators.

The new UI remains in `app/page.tsx`, `app/globals.css`, `components/confetti.tsx`, `components/example-postcard.tsx`, and the demo media files. Backend/source-of-truth contracts remain from `main`: `lib/client-api.ts`, `lib/tools/*`, `app/api/*`, and `next.config.ts`.

## Integration Notes

- Server state stays stateless. Plan/job records round-trip through the client.
- UI generation flow is wired to `studioApi.createPlan`, `studioApi.startGeneration`, and `studioApi.checkJob`.
- The old `/api/voice-clone` and `/api/jobs/[jobId]` paths are gone.
- Voice sample setup in the new dashboard UI stores the local sample and passes it through the current backend flow.
- `next.config.ts` must keep `outputFileTracingIncludes["/api/jobs/check"]` for `ffmpeg-static`; otherwise muxing fails on Vercel.
- Fal native audio is intentionally disabled. ElevenLabs carries narration, S2S, or song audio, then muxing bakes the final audio into `JobRecord.videoUrl`.

## Validation

Passed locally after the merge:

- `npx tsc --noEmit`
- `npm test` — 48 tests passing
- `npm run build`
- Browser smoke check at `http://localhost:3003`: dashboard UI loads, `New birthday video` is visible, and no console errors were observed.

## Blockers Or Risks

- Remote `origin` is configured as SSH and rejected the local key during fetch. The latest `main` was fetched over HTTPS instead. Push may need a working GitHub credential or remote URL adjustment.
- Vercel bundle size should be watched because `ffmpeg-static` is now included with `/api/jobs/check`.
- The HTML "Happy Birthday {Name}" overlay is still not baked into downloaded MP4s; that remains deferred unless requested.

## Next Context For Claude

Claude should redeploy from this branch or merge it forward knowing this is a frontend-preserving backend merge. Do not replace the dashboard UI with `main`'s simpler app shell, and do not regress the stateless backend contracts from `main`.
