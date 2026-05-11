# Ops Update

- Date: 2026-05-10
- Branch: main
- Commit: 0edddcd

## Summary

Finish Mother's Day to BirthdayBot parity:

1. Drop the "Currently being worked on" status pill on `/mothers-day`.
   The flow is end-to-end functional and shouldn't read as a beta.
2. Add a `Download video` sticker-button on the Mother's Day result
   panel pointing at `/api/download` with a recipient-derived filename
   (`mothers-day-mom.mp4`, etc.). The "Generate again" button drops to
   outline styling once a muxed video is ready so download is the
   primary action.
3. Surface ElevenLabs voice-clone failures. Previously when
   `/v1/voices/add` or speech-to-speech failed, we logged and silently
   fell back to a stock voice — the user heard a generic voice with no
   signal. The stock-voice fallback path now carries
   `voiceOverError` describing the upstream ElevenLabs error
   (truncated to 200 chars), which both wizards already render on the
   result card.

## Blockers Or Risks

- The voice-clone failure message can be ElevenLabs-jargon-heavy
  (e.g. "voice cloning not available on this tier" → user has to
  reason about IVC tier limits). Worth a UI pass to map common
  failure modes to friendlier copy. Out of scope for this push.

## Next Context

If voice cloning still doesn't produce the user's actual voice on the
live site, the next debug step is to:

1. Reproduce on `/mothers-day` or the BirthdayBot wizard with a fresh
   ~10-15s sample and consent checked.
2. Watch the result card for the new `voiceOverError` — it will name
   the underlying ElevenLabs error.
3. Cross-check ElevenLabs account: `ELEVENLABS_API_KEY` set in prod
   (confirmed earlier today), IVC enabled on the account tier
   (likely the failure mode if voiceOverError says "not available on
   this tier"), and `/v1/voices` listing reachable with the key.

Also: `scripts/api-check.ts` runs an end-to-end provider connectivity
sweep including ElevenLabs IVC capability — `npx tsx scripts/api-check.ts`.
