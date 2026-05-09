# Locked Decisions

- Status: Complete
- Last Updated: 2026-05-09

## Product Shape

Choice: mobile-first web app.

Rationale:

- This gives the fastest path to a polished hackathon demo while still matching the “mobile product” feel.
- It reduces build, packaging, and device-debugging risk so effort stays focused on the agent workflow and video quality.

## Frontend

Choice: `Next.js` app using a mobile-first UI.

Rationale:

- `Next.js` supports a strong product UI plus the server-side routing and orchestration this app needs.
- It keeps frontend and backend logic in one codebase, which is simpler and faster for a hackathon MVP.

## Backend

Choice: `Next.js` Route Handlers with server-side TypeScript orchestration.

Rationale:

- The product needs secure provider orchestration, upload handling, job submission, progress endpoints, and retry logic.
- Route Handlers are enough for the MVP without introducing a separate backend service.

## Database

Choice: no database in the first version.

Rationale:

- The MVP is a single-session, no-auth flow, so persistent relational state is not required to prove the product.
- Skipping the database reduces setup and implementation overhead, which improves delivery speed.

## Auth

Choice: none for the MVP.

Rationale:

- Sign-in adds friction and does not help the core demo.
- The product goal is instant creation, not account management.

## Deployment

Choice: `Vercel`.

Rationale:

- It is the most direct deployment fit for a `Next.js` app.
- It supports fast iteration and simple hosting for a hackathon delivery cycle.

## AI And Core Logic

Choice:

- `OpenAI` handles photo analysis, structured agent-plan generation, and birthday caption generation.
- `fal` handles async photo-to-video generation.
- The app backend owns orchestration, retries, and progress-state mapping.

Rationale:

- `OpenAI` is a strong fit for turning photo plus prompt into a typed plan that the UI can show before generation.
- `fal` is the best match for the actual video-generation step and fits the async progress-driven UX.
- Keeping orchestration in the app backend creates a more agentic system than direct client-to-model calls.

Locked workflow:

1. User uploads one shared photo and enters prompt/settings.
2. Backend sends the image and prompt to `OpenAI`.
3. `OpenAI` returns a structured agent plan and caption draft.
4. User approves the plan.
5. Backend submits the video job to `fal`.
6. UI polls app-owned status endpoints and shows friendly progress stages.
7. Backend retries once with a refined strategy if generation fails or looks weak.
8. Final screen shows video preview, caption, and refinement/export actions.

## Rejected Alternatives

- Native mobile app with `Flutter` or `Expo`: rejected because it increases hackathon risk and slows delivery without improving the core agent/video value.
- Separate backend service: rejected because `Next.js` backend capabilities are sufficient for the MVP.
- Database from day one: rejected because persistence is not required for the first version and would expand scope.
- Client-side direct provider orchestration: rejected because it weakens security, complicates control flow, and makes the agent story less robust.
- Multi-photo workflow: rejected because it adds complexity and is outside the MVP scope.
- Auth in the MVP: rejected because it adds friction and does not help the main user flow.

## Summary Rationale

This stack is optimized for the actual product goal: a reliable, impressive, agentic birthday-video demo. The choices favor speed of implementation, clear orchestration, and a user experience that makes the system’s planning and execution visible.

The combination of `Next.js`, `OpenAI`, and `fal` keeps the architecture simple while still supporting the most important product requirements: photo analysis, plan generation, async video creation, visible progress, retry handling, and a fast path to deployment.
