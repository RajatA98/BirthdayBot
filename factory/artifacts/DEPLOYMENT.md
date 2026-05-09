# Deployment

- Status: Complete
- Last Updated: 2026-05-09

## Steps

Target deployment:

- `Vercel`

Deployment steps:

1. Create a Vercel project pointed at this repository.
2. Set the required environment variables:
   - `OPENAI_API_KEY`
   - `FAL_KEY`
3. Optionally set:
   - `OPENAI_PLAN_MODEL`
   - `OPENAI_CAPTION_MODEL`
   - `FAL_VIDEO_MODEL`
4. Run a production build locally with `npm run build`.
5. Deploy to Vercel.
6. Verify the core flow in production:
   - draft creation
   - agent plan review
   - generation progress
   - final result rendering

Operational note:

- The current MVP stores plan/job state in memory. That is acceptable for a hackathon demo, but if the runtime restarts or the deployment scales across instances, active jobs will not persist.
