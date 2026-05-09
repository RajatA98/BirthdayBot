# Environment Setup

- Status: Complete
- Last Updated: 2026-05-09

## Variables

Required for real-provider mode:

- `OPENAI_API_KEY`: used for photo analysis, agent-plan generation, and caption generation
- `FAL_KEY`: used for photo-to-video generation through `fal`

Optional overrides:

- `OPENAI_PLAN_MODEL`: defaults to `gpt-4.1-mini`
- `OPENAI_CAPTION_MODEL`: defaults to `gpt-4.1-mini`
- `FAL_VIDEO_MODEL`: defaults to `fal-ai/kling-video/v2.1/standard/image-to-video`

Notes:

- If `OPENAI_API_KEY` is missing, the app falls back to deterministic mock planning and caption generation.
- If `FAL_KEY` is missing, the app falls back to a mock video-generation flow with staged progress and a sample video URL.
- Do not expose these values in the client. Keep them in server-side environment configuration only.
