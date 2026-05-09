# Project Plan

- Status: Complete
- Last Updated: 2026-05-09

## Phases

## Phase 1 — App Skeleton And Input Flow

**Objective** — Establish the core application shell and the first user flow: landing on the app, choosing simple or advanced mode, entering a prompt, configuring controls, and uploading a photo.

**Deliverables**

- `Next.js` app scaffolded and running
- mobile-first landing and creation UI
- simple mode and advanced mode toggle
- prompt input and advanced controls form
- one-photo upload UI with validation
- initial local state model for a draft generation request

**Acceptance Criteria**

- User can open the app and see a polished mobile-first creation screen.
- User can switch between simple and advanced mode.
- User can enter a prompt and, in advanced mode, configure the required settings.
- User can upload one photo successfully and see it reflected in the UI.
- Invalid or missing input is handled with clear validation messages.

**Risk Notes**

- It is easy to build a generic UI that does not feel product-ready.
- File upload behavior and preview handling can become messy if not scoped tightly.

## Phase 2 — Agent Planning Flow

**Objective** — Build the pre-generation intelligence layer that takes the uploaded photo and user input, analyzes them, and produces a visible structured agent plan plus a caption draft before video generation starts.

**Deliverables**

- backend endpoint for plan generation
- `OpenAI` integration for photo analysis and structured plan output
- typed agent-plan schema
- caption draft generation
- review screen showing the plan before generation

**Acceptance Criteria**

- User can submit a valid request and receive an agent plan.
- The plan includes a clear concept, tone, generation strategy, and caption direction.
- The generated caption is shown alongside or near the plan.
- User can approve the plan before continuing.
- Failure states from planning are handled cleanly.

**Risk Notes**

- Poor prompt design could make the plan vague or repetitive.
- The visible plan needs to be informative without overwhelming the user.

## Phase 3 — Video Generation Job And Progress UX

**Objective** — Connect approved plans to async video generation and expose clear progress states while the job runs.

**Deliverables**

- backend endpoint to submit video jobs to `fal`
- app-owned job/status endpoint
- progress UI with meaningful stages
- initial result handoff when generation completes

**Acceptance Criteria**

- User can approve a plan and start generation successfully.
- The app shows visible progress states instead of a generic spinner.
- The frontend can observe job completion and transition to a result state.
- Generation errors are surfaced in a controlled way.

**Risk Notes**

- Async job coordination can become brittle if status mapping is unclear.
- Video latency may hurt perceived quality unless the progress experience is strong.

## Phase 4 — Result Screen, Refinement Loop, And Export

**Objective** — Deliver the full post-generation experience: preview, caption, regenerate, prompt/settings refinement, and export actions.

**Deliverables**

- result screen with video preview
- caption display and copy action
- download action for the generated video
- regenerate flow
- prompt/settings edit flow that returns to planning or generation cleanly

**Acceptance Criteria**

- User can view the generated video and caption together.
- User can copy the caption.
- User can download the video.
- User can regenerate or revise input without restarting from scratch.
- The result flow feels coherent on mobile screens.

**Risk Notes**

- Result-state transitions can become confusing if re-generation is not modeled clearly.
- Download behavior may vary across browsers and deployment environments.

## Phase 5 — Reliability, Retry Logic, And Demo Polish

**Objective** — Harden the main flow for a live demo by adding automatic retry/refinement logic, graceful error handling, and targeted UX polish.

**Deliverables**

- retry strategy for failed or weak generations
- clearer fallback/error messaging
- end-to-end flow polish across create, plan, generate, and result screens
- deployment-ready environment/config handling
- final demo-fit UX improvements

**Acceptance Criteria**

- The system attempts an automatic recovery pass when generation fails.
- The app handles major failure paths without dead ends.
- The core demo flow works end to end in a stable way.
- The UI feels polished enough for a hackathon presentation.
- Secrets remain server-side and configuration is documented clearly enough to run.

**Risk Notes**

- Reliability work can sprawl if done too early.
- Weak-output detection may need simple heuristics rather than a complex scoring system.
