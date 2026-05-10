# Environment Setup

- Status: Complete
- Last Updated: 2026-05-09

## Variables

Required for real-provider mode:

- `OPENAI_API_KEY`: used for photo analysis, agent-plan generation, and caption generation
- `FAL_KEY`: used for photo-to-video generation through `fal`
- `ELEVENLABS_API_KEY`: used for cloning the uploaded/recorded voice sample and generating voice-over audio

Optional overrides:

- `OPENAI_PLAN_MODEL`: defaults to `gpt-4.1-mini`
- `OPENAI_CAPTION_MODEL`: defaults to `gpt-4.1-mini`
- `FAL_VIDEO_MODEL`: defaults to `fal-ai/kling-video/v3/standard/image-to-video`
- `ELEVENLABS_TTS_MODEL`: defaults to `eleven_multilingual_v2`

Notes:

- If `OPENAI_API_KEY` is missing, the app falls back to deterministic mock planning and caption generation.
- If `FAL_KEY` is missing, video generation fails with a configuration error instead of returning the stock demo video.
- If `ELEVENLABS_API_KEY` is missing, video generation can still run, but uploaded voice samples will not produce cloned voice-over audio.
- The client requires explicit voice-cloning consent before a recorded or uploaded sample is submitted server-side to ElevenLabs.
- Do not expose these values in the client. Keep them in server-side environment configuration only.
