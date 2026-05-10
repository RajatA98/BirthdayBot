# Codex Updates

## 2026-05-09

- Initialized Project Factory repo scaffolding.
- Added `ops/`, `factory/artifacts/`, `.githooks/`, and `scripts/` helpers.
- No product requirements are defined yet.
- Next: capture the project idea and complete the Understand phase.

## 2026-05-09

- Completed the Understand phase for `BirthdayBot`.
- Locked the MVP shape to a mobile-first web app with one-photo birthday video generation, a companion caption, visible agent planning/progress, and narrow hackathon scope.
- Next: draft the PRD and confirm the feature and flow details before stack research.

## 2026-05-09

- Completed the PRD for `BirthdayBot`.
- Defined the two-mode UX, visible agent-plan step, refinement/export loop, and automatic recovery requirement for failed generations.
- Next: run presearch to decide the fastest reliable stack and provider pipeline for the hackathon MVP.

## 2026-05-09

- Completed presearch and selected the leading architecture direction.
- Recommendation is `Next.js + OpenAI + fal + Vercel`, with no database initially and storage added only if needed.
- Next: lock decisions so implementation can proceed against a fixed stack.

## 2026-05-09

- Locked the implementation decisions for the MVP.
- Final direction is a mobile-first `Next.js` web app on `Vercel`, with `OpenAI` for planning/caption work and `fal` for async video generation.
- Next: break the MVP into bounded implementation phases.

## 2026-05-09

- Completed the implementation plan.
- Broke the MVP into five TDD-friendly phases: app shell/input flow, agent planning, async generation/progress, result/refinement/export, and reliability/demo polish.
- Next: implement Phase 1 in small test-first slices.

## 2026-05-09

- Completed Phase 1 of implementation.
- Added the `Next.js` app scaffold, mobile-first creation UI, simple and advanced modes, upload handling, validation, and a `Vitest` test harness.
- Verified with `npm test` and `npm run build`.
- Next: implement the agent planning flow with structured plan generation and plan review UI.

## 2026-05-09

- Completed Phases 2 through 5 of implementation.
- Added server-side plan generation, app-owned async generation routes, progress polling, result/refinement UI, `OpenAI` and `fal` integration wrappers, and mock fallbacks for demo safety.
- Added automatic retry on failed generation states and finalized review/test/deployment artifacts.
- Verified the final repo state with `npm test` and `npm run build`.

## 2026-05-09

- Merged `feature/birthdaybot-next` back into `main`.
- `main` now includes the four core backend tools: `analyze_photo`, `plan_birthday_video`, `start_video_generation`, and `check_video_generation`.
- Upgraded the default `fal` video model to Kling `v3`, switched the internal prompt layer to a director-style structure, and added a backend download proxy for more reliable video downloads.
- Added file-backed local plan/job persistence for development so the generate step no longer loses the plan between requests.
- Updated `README.md` with the current architecture, setup steps, env vars, testing commands, key files, and known limitations.
- Current status: end-to-end flow works, video generation is working, but prompt quality still needs tuning on real photos to reduce subject drift and improve output consistency.
- Next: keep testing against a small golden set of photos/prompts and refine the prompt-engineering layer before broader demo use.
