# Product Requirements Document

- Status: Complete
- Last Updated: 2026-05-09

## Overview

`BirthdayBot` is a mobile-first web app that helps someone turn a single shared photo and a rough birthday idea into a polished, personalized birthday package. The MVP generates both a short cinematic birthday video and a matching birthday caption/message, while also showing the user an agent plan and visible generation progress so the experience feels intelligent and trustworthy.

## Goals

1. A user can start from the landing screen, upload a photo, enter a prompt, and reach a generation-ready state in under 2 minutes.
2. The system produces a usable birthday video and matching caption/message in one end-to-end flow without requiring manual editing tools.
3. The product clearly shows what the agent is doing before and during generation so a demo viewer can understand the planning and execution steps.
4. A user can refine the first result through regeneration or prompt/settings changes without restarting the entire experience.
5. The final output can be exported immediately through video download and caption copying.

## Users

Primary user: an everyday sender who wants to make a birthday message feel more thoughtful than a plain text.

User characteristics:

- often acting quickly or at the last minute
- not an expert in video editing
- wants a result that feels personal, polished, and emotionally appropriate
- may have only one suitable photo available
- likely using a phone or a laptop in a mobile-like browsing context

User needs:

- minimal friction to begin
- enough control to steer the result without learning complex tooling
- confidence that the system understood the photo and prompt correctly
- a result that is both visually impressive and immediately sendable

## Core Flows

### Flow 1: Generate in Simple Mode

1. User opens the app.
2. User sees a mobile-first creation screen with a simple mode option.
3. User uploads one photo containing themselves and the birthday recipient.
4. User enters a free-text prompt describing the birthday video they want.
5. User submits the request.
6. The system analyzes the photo and prompt.
7. The app shows a short agent plan explaining the intended concept, mood, and generation strategy.
8. User confirms generation.
9. The app shows visible progress states while the system writes the caption/message and generates the video.
10. User sees the final video preview and generated birthday caption.

### Flow 2: Generate in Advanced Mode

1. User opens the app and chooses advanced mode.
2. User uploads one photo and enters a free-text prompt.
3. User optionally sets controls such as tone, scene idea, video length, aspect ratio, caption style, music vibe, motion intensity, and agent goal mode.
4. User submits the request.
5. The system analyzes the photo and prompt, combines them with the selected controls, and shows the agent plan.
6. User confirms generation.
7. The app shows visible progress states until generation is complete.
8. User views the final video and caption.

### Flow 3: Refine and Export

1. User reviews the first generated result.
2. User chooses one of the available actions: regenerate, edit prompt, adjust settings, download video, or copy caption.
3. If the user edits prompt or settings, the system updates the plan and re-runs generation.
4. If the user downloads or copies, the app provides the output immediately without extra setup.

### Flow 4: Automatic Recovery on Failure

1. A generation attempt fails or returns a low-confidence result.
2. The system automatically retries once or more using a refined or simplified generation strategy.
3. The app continues to show visible progress/status updates.
4. If recovery succeeds, the user sees the final result as normal.
5. If recovery still fails, the app explains the failure clearly and offers a regenerate path.

## Functional Requirements

1. The app must allow a user to upload one photo containing the sender and birthday recipient.
2. The app must allow a user to enter a free-text prompt describing the intended birthday video.
3. The app must provide both a `Simple` mode and an `Advanced` mode.
4. In advanced mode, the app must allow the user to configure at least these controls: tone, scene idea, video length, aspect ratio, caption style, music vibe, motion intensity, and agent goal mode.
5. Before generation, the system must analyze the uploaded photo and user input to produce an agent plan.
6. The app must display the agent plan to the user before generation starts.
7. The user must be able to confirm generation after reviewing the agent plan.
8. The system must generate a short birthday video based on the uploaded photo, user prompt, and any selected controls.
9. The system must generate a matching birthday caption/message aligned with the same tone and concept as the video.
10. The app must show visible progress states during generation rather than a generic spinner-only experience.
11. The final result screen must show a video preview and the generated caption/message together.
12. The result screen must support these actions: regenerate, edit prompt, adjust settings, download video, and copy caption.
13. The system must attempt at least one automatic recovery pass if generation fails or produces a low-confidence result before surfacing failure to the user.
14. The app must work without requiring sign-in or account creation.
15. The app must support a single sender and single recipient workflow for the MVP.

## Non-Functional Considerations

### Performance

- The experience should feel responsive enough for a live demo, with immediate UI feedback after every user action.
- The app should expose progress states quickly after submission so the user is never left on a blank waiting screen.

### Reliability

- The end-to-end flow should handle generation failures gracefully through automatic retries or fallback messaging.
- The demo should prioritize completing the main flow reliably over supporting broad edge-case scope.

### Usability

- The interface should be mobile-first and simple enough for a first-time user to understand without instructions.
- The difference between simple mode and advanced mode should be visually obvious.
- The refinement actions after generation should be easy to find and easy to understand.

### Trust And Transparency

- The system should explain its plan before generation and its progress during generation so users can understand what it is doing.

### Security And Privacy

- Uploaded photos should be handled only as needed for the generation flow in the MVP.
- Secrets and API keys must not be exposed in the client.

## Non-Goals

- user accounts or authentication
- saved history, project libraries, or persistent user profiles
- payments or subscriptions
- multi-photo uploads or album-style generation
- full manual timeline editing or professional editor workflows
- non-birthday occasion support in the MVP
- collaboration, multi-recipient workflows, or shared projects
- direct publishing to social platforms or messaging apps
- broad administrative tooling or production moderation systems

## Open Questions

- Which provider combination should be used for image understanding, prompt planning, caption generation, and video generation?
- How should the system determine that an output is low-confidence and worth retrying automatically?
- Should the agent plan be editable directly, or only influenceable through prompt and advanced controls?
- What default duration and aspect ratio should be used in simple mode?
