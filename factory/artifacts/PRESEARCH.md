# Presearch

- Status: Complete
- Last Updated: 2026-05-09

## Technical Requirements

The MVP needs:

- a mobile-first web app experience
- one-photo upload and prompt input
- a visible agent planning step before generation
- visible progress states during generation
- a short cinematic birthday video output
- a matching birthday caption/message output
- a refinement loop for regenerate, prompt edits, and settings changes
- automatic retry or refinement if generation fails or looks weak
- server-side handling of API keys and orchestration logic

The system should optimize for:

- demo reliability
- high perceived quality
- simple deployment
- minimal setup overhead during a hackathon

## Constraints And Preferences

- web app is preferred over native mobile app for speed and reliability
- the UI should still feel mobile-first and app-like
- no auth in the MVP
- no database unless a clear need appears
- visible agent reasoning is a feature, not just an implementation detail
- the stack should minimize infra complexity so effort stays focused on the generation flow
- likely available providers include `OpenAI` and `fal`

## Options Considered

### Frontend and App Shell

#### Option A: Next.js web app

Pros:

- fastest path to a polished hackathon product
- easy deployment and iteration
- works well for uploads, server routes, and mobile-first UI
- lowers native build and device risk

Cons:

- not a true native mobile app

Recommendation:

- choose this for the MVP

#### Option B: React Native / Expo

Pros:

- stronger “real mobile app” story
- native app feel

Cons:

- slower to build and debug during a hackathon
- more packaging and device complexity
- distracts from the core agent/video problem

Recommendation:

- not preferred for the MVP

### Agent and Text Generation

#### Option A: OpenAI for image understanding, plan generation, and caption generation

Pros:

- strong fit for image analysis plus reasoning
- structured outputs can produce typed agent plans
- one provider can handle both planning and caption creation

Cons:

- adds provider dependency for core logic

Recommendation:

- choose this for the MVP

### Video Generation

#### Option A: `fal` async video generation

Pros:

- purpose-built for model orchestration
- async job model fits visible progress UI
- likely the fastest path given available access

Cons:

- generation quality and latency can vary by model
- long-running jobs require status handling

Recommendation:

- choose this for the MVP

### Storage and Persistence

#### Option A: no database initially

Pros:

- simpler architecture
- faster implementation
- less schema and persistence work

Cons:

- limited history and job persistence
- less resilience if the session refreshes mid-generation

Recommendation:

- start here

#### Option B: add object storage or Supabase from day one

Pros:

- persistent uploads and outputs
- easier recovery across refreshes

Cons:

- more infrastructure and setup cost
- larger scope than needed for the first cut

Recommendation:

- only add if uploads or result delivery require it

### Deployment

#### Option A: Vercel

Pros:

- best fit for a Next.js app
- fast deployment loop
- good fit for server routes and lightweight orchestration

Cons:

- long-running work still needs async job handling rather than blocking requests

Recommendation:

- choose this for the MVP

### Architecture Pattern

#### Recommended flow

1. User uploads a photo and enters a prompt in the Next.js app.
2. The server sends the image and prompt to OpenAI.
3. OpenAI returns a structured agent plan and a caption draft.
4. The user reviews the plan and confirms generation.
5. The server submits a video generation job to `fal`.
6. The UI polls app-owned status endpoints and shows friendly progress states.
7. If generation fails or returns a weak result, the server retries once with a refined strategy.
8. The final screen shows the video, caption, and refinement/export actions.

## Risks

- video generation latency may be high, so the progress UX must be strong
- output quality may vary depending on the chosen `fal` model
- without persistence, refreshes during generation could be awkward
- retry heuristics for “weak output” may be difficult to define cleanly
- a fully visible agent plan is useful, but too much detail may overwhelm users
- file handling and temporary asset URLs need careful server-side design

## Recommendation Summary

Recommended MVP stack:

- `Next.js` for the mobile-first web app
- `Next.js` Route Handlers for backend endpoints and orchestration
- `OpenAI` for photo analysis, structured agent-plan generation, and birthday caption generation
- `fal` for async photo-to-video generation
- `Vercel` for deployment
- no database initially
- add storage only if upload/result persistence becomes necessary

Recommended industry practices to incorporate:

- keep all provider keys server-side
- use structured outputs for the agent plan instead of free-form text
- treat video generation as an async job, not a blocking request
- expose user-friendly progress stages during generation
- keep the client talking to your own backend, not directly orchestrating provider calls
- add at least one automatic retry or refinement pass for failed generations
- design the UI around a tight create -> review plan -> generate -> refine loop
