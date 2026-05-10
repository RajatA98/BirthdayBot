# Ops Update

- Date: 2026-05-09
- Branch: main
- Commit: pending

## Summary

Hardened the `BirthdayBot` generation flow after real-browser testing:

- fixed the `Plan not found` bug by replacing the volatile in-memory store with a local file-backed store
- simplified the create screen by removing the draft summary block
- redesigned the upload area into a drag-and-drop style photo dropzone
- added backend prompt-engineering fields like `subjectCount`, `identityAnchors`, `sceneGuardrails`, `safePrompt`, and `negativePrompt`
- added a `Make a new video` action on the result screen

## Blockers Or Risks

- video generation is working, but the prompt engineer still needs tuning to improve identity preservation and overall output quality
- current `fal` usage is effectively producing 5-second videos because duration has not been explicitly wired through to the provider request yet

## Next Context

- if quality is the next priority, focus on prompt-engineer tuning in `lib/plan-service.ts`, `lib/agent-plan.ts`, and `lib/video-service.ts`
- if product flexibility is the next priority, wire advanced controls like duration and aspect ratio all the way into the `fal` request payload
