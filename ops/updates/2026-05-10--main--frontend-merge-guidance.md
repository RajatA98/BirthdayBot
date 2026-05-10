# Ops Update — frontend-merge guidance for codex

- Date: 2026-05-10
- Branch: main
- Commit: 3838cf9 (at time of writing)

## Status of `codex/final-stretch`

`origin/codex/final-stretch` is a stale pointer at commit `4c59c5e` — the pre-stateless-rewrite codebase from earlier in the week.

```
$ git log origin/codex/final-stretch ^main --oneline
# (empty — zero commits unique to the branch)
```

`main` is far ahead. Everything that was useful from final-stretch (the double-audio fix in `3838cf9`) is already on `main`. Do **not** merge `codex/final-stretch` into `main` — it would undo the four-tool architecture, the stateless rewrite, the fal proxy route, eleven_v3 + audio tags, IDENTITY LOCK, voice modes, the editable brief, voice persistence, and everything else that's shipped since `4c59c5e`.

The branch should be deleted on the remote when you have a moment:

```
git push origin --delete codex/final-stretch
```

## What's load-bearing on main right now (do not regress)

If you're picking up frontend work on a new branch, take `main` as the base. The files below are the source of truth for state, types, and provider integration. Do not rewrite them on a frontend pass:

- `lib/types.ts` — `DraftRequest`, `PlanRecord`, `JobRecord`, `VoiceMode`, `SongStyle`, `JobLogEntry`. Treat these shapes as a contract.
- `lib/tools/*.ts` — eight tools: analyze-photo, plan-birthday-video, build-video-input, start-video-generation, check-video-generation, create-voice-over, generate-music-bed, mux-voice-over. Don't touch.
- `lib/client-api.ts` — the StudioApi contract (`createPlan`, `startGeneration`, `checkJob`). Frontend components consume this; don't bypass.
- `lib/agent-plan.ts`, `lib/plan-service.ts`, `lib/langfuse.ts`, `lib/server-env.ts` — leave as-is.
- `app/api/plan/route.ts`, `app/api/generate/route.ts`, `app/api/jobs/check/route.ts`, `app/api/download/route.ts`, `app/api/fal/proxy/route.ts` — server stays stateless. The wire format is `PlanRecord` and `{ job, plan }` round-tripping through the client.
- `next.config.ts` — `outputFileTracingIncludes` for `/api/jobs/check` is required for ffmpeg on Vercel. Don't rename the route.

## What's safe for a frontend pass

A frontend collaborator can substantively change:

- `app/globals.css` — visual design system; rewrite freely as long as the class names below stay reachable from the component
- `components/creation-form.tsx` — visual structure, layout, animations. **Keep the state, refs, helpers, useEffects, and hooks intact** (they handle voice persistence, recording, fal proxy upload, polling, localStorage hydration, etc.); change the JSX and CSS classes around them.
- `app/page.tsx`, `app/layout.tsx` — page shell

Class names the component currently relies on (keep these or update both sides together):

```
.app-shell .hero-card .creation-form .upload-card .voice-recorder
.voice-mode-card .voice-mode-pill .voice-message-card
.song-style-grid .song-style-chip
.editable-plan-card .editable-plan-input .editable-plan-title
.editable-caption .editable-caption-input
.progress-rail .progress-log .voice-take-hint .voice-quality-tip
.ai-badge .voice-consent-group .voice-clip-list
.recording-badge .generation-loader
```

## Recommended workflow to merge a frontend branch into main

If the frontend work was done off the stale base (or as a separate branch from any point), the safest path is:

1. **Do not merge.** Cherry-pick or copy by file.
2. Branch off current `main`:
   ```
   git checkout main
   git pull
   git checkout -b frontend-merge-2026-05-10
   ```
3. Copy ONLY the visual files from the frontend branch into the new branch:
   ```
   git checkout <frontend-branch> -- app/globals.css
   git checkout <frontend-branch> -- app/page.tsx
   git checkout <frontend-branch> -- app/layout.tsx
   # Cherry-pick component JSX changes by hand if the frontend
   # branch's creation-form has a different state model.
   ```
4. Reconcile `components/creation-form.tsx` manually:
   - Take main's hooks/refs/handlers as the base (they own all the logic).
   - Lift the new visual structure (JSX tree, class names, inline styles) from the frontend branch.
   - Wire each new visual element to the existing handlers (`startVoiceRecording`, `stopVoiceRecording`, `clearVoiceSample`, `requestPlan`, `startGeneration`, `clearUserMessage`, `setVoiceMode`, `setSongStyle`, `updatePlanField`, etc.).
5. Run the full test suite — every test in `tests/creation-form.test.tsx` must still pass against the new JSX (they query by accessible role / label / display value, not by CSS, so a visual-only refresh shouldn't break them).
6. `npx tsc --noEmit && npm test && npm run build` before opening the PR.

## What absolutely cannot drop in a frontend merge

- The voice-mode toggle (`narrate` / `speak-yourself` / `song`)
- The 3-tone calibration recorder + per-take audio preview list
- The user-message recorder (speak-yourself mode)
- The song-style chip grid (song mode)
- The 3-checkbox granular consent fieldset
- The editable plan fields (every section, with the read-only guardrails preserved)
- The editable birthday message with live word/char counter
- The progress log + stage rail during generation
- The result screen with HTML overlay caption, AI-generated badge, download via `/api/download?url=...`
- localStorage hydration on mount + persist effects (`birthdaybot:active`, `birthdaybot:voice-draft`, `birthdaybot:cached-voice-id`)
- Fal proxy photo upload before plan call

If a frontend branch's component is missing any of these, treat them as features that have to be added back, not features to drop.

## TL;DR

- `codex/final-stretch` is dead code — no commits unique to it.
- main is the canonical head with all logic + backend.
- Frontend work should rebase onto main and treat `lib/` + `app/api/` + `next.config.ts` + `lib/client-api.ts` as untouchable.
- The visual design and JSX are fair game inside `components/creation-form.tsx` and `app/globals.css`, as long as the existing state hooks and class-name contract are preserved.
