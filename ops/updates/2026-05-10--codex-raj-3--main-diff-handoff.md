# Ops Update — main diff handoff

- Date: 2026-05-10
- Branch: `codex/raj-3`
- Compared against: `main` at `f30e75e`
- Current commit: `b6bdd28`
- Diff command used: `git diff main...HEAD`

## Summary

`codex/raj-3` is one commit ahead of `main` and turns the dashboard wizard into a fuller BirthdayBot send flow. The branch keeps the existing stateless generation pipeline, adds a polished in-wizard generation preview, resumes in-flight wizard work from `sessionStorage`, and introduces a real email send path powered by Resend.

The diff touches 12 files: 9 modified files and 3 new files.

## Product And UI Changes

- `app/page.tsx` now treats the wizard as a four-step flow: who, photo, prompt, email.
- Friend records now carry `email`, and new drafts default to email delivery with a default video prompt.
- The prompt step now sends the user-entered prompt directly to the existing planning/generation API instead of composing a longer prompt from relation/style copy.
- The preview step can generate a real video from the dashboard UI using `studioApi.createPlan`, `studioApi.startGeneration`, and `studioApi.checkJob`.
- In-flight generation state is persisted in `sessionStorage` for up to two hours and resumes polling after reload when a saved job is present.
- The preview area now shows a moving photo-based generation/loading treatment while the job is planning or rendering.
- Generated videos are rendered through a `GeneratedVideo` component that keeps a separate `voiceOverUrl` audio element synchronized with the video when present.
- The final wizard panel adds a recipient email field and a send action that calls the new email API.
- `components/creation-form.tsx` gives the existing generation loader access to the uploaded photo, so the old form also shows a richer photo-backed loading state.
- `app/globals.css` adds styles and keyframes for the new video loading preview, generation loader photo treatment, and email-sending animation.
- `public/demo.mp4` was replaced with a larger demo asset: about 8.5 MB on `main` to about 29.4 MB on this branch.

## Backend And API Changes

- New route: `app/api/email/send/route.ts`.
- New template helper: `lib/email-template.ts`.
- New API client method: `studioApi.sendEmail`.
- New shared types: `EmailSendRequest` and `EmailSendResponse`.
- The email route validates recipient, message, and generated video URL before sending.
- Email delivery uses the Resend API with `RESEND_API_KEY`.
- Sender selection prefers `BIRTHDAYBOT_EMAIL_FROM`, then `EMAIL_FROM`, then Resend's onboarding default.
- If `RESEND_API_KEY` is missing, the route returns a `503` with a configuration message instead of silently succeeding.
- The HTML email includes an inline video block plus a fallback link for inboxes that block video playback.
- `README.md` documents `RESEND_API_KEY` and `BIRTHDAYBOT_EMAIL_FROM`.

## Muxing Change

- `lib/tools/mux-voice-over.ts` now imports `ffmpeg-static` directly.
- It falls back to a traced `node_modules/ffmpeg-static/ffmpeg` path if the direct import does not resolve to a usable string.
- This replaces the prior dynamic `createRequire` lookup and should be friendlier to Next/Vercel tracing.

## Tests Added Or Updated

- `tests/email-template.test.ts` adds coverage for:
  - inline playable video markup,
  - fallback watch link copy,
  - HTML and attribute escaping,
  - avoiding download-focused language.
- `tests/creation-form.test.tsx` updates the `StudioApi` mock with the new `sendEmail` method.

## Integration Notes

- Production email sending now needs `RESEND_API_KEY` and a verified sender in `BIRTHDAYBOT_EMAIL_FROM`.
- The dashboard wizard stores photo data URLs and generation state in browser `sessionStorage`; quota failures are intentionally ignored so the live in-memory flow still works.
- The email send button is disabled until a generated video URL exists.
- The email route does not persist sent status server-side. It returns the provider id only.
- The dashboard flow still depends on a ready voice clone before video generation.
- The separate `GeneratedVideo` voice-over sync path matters only when `voiceOverUrl` is separate from the muxed video URL.
- The larger `public/demo.mp4` may affect repo weight and app asset transfer size.

## Validation

No validation commands were run while creating this handoff. The diff adds/updates tests, but `npm test`, `npx tsc --noEmit`, and `npm run build` should still be run before merging.

## Files Changed

- `README.md`
- `app/api/email/send/route.ts`
- `app/globals.css`
- `app/page.tsx`
- `components/creation-form.tsx`
- `lib/client-api.ts`
- `lib/email-template.ts`
- `lib/tools/mux-voice-over.ts`
- `lib/types.ts`
- `public/demo.mp4`
- `tests/creation-form.test.tsx`
- `tests/email-template.test.ts`
