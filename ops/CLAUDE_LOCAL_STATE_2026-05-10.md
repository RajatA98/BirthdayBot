# BirthdayBot Local State for Claude

Date: 2026-05-10
Branch: `codex/remove-birthday-autopilot`

## Summary

This local branch has been focused on making BirthdayBot generate usable 15-second birthday videos with cloned narration and a controlled party-music bed. The final audio target is:

- generated ElevenLabs narration from the app-generated birthday script only
- local party music quietly underneath
- no generated video audio, no crowd screams, no recorded sample/gibberish mixed into the final MP4

The current default FAL model remains `fal-ai/kling-video/v3/standard/image-to-video`.

## Important Behavior

### Video Duration

- Default video length is now `15 seconds`.
- The advanced length selector now offers `15 seconds`, `10 seconds`, and `20 seconds`.
- FAL v3 requests are capped to the provider's live 15-second duration limit.
- The final mux normally targets 15 seconds.
- If the generated narration file is slightly longer, the final mux can extend up to 20 seconds so narration is not cut off.

### Narration

- Voice cloning still uses the uploaded/recorded sample only as a voice source.
- The spoken text sent to ElevenLabs is the generated caption/script, not the uploaded recording content.
- `birthdayVoiceOverText` now cleans labels and accidental lead-in filler before TTS, for example:
  - strips labels like `Voice-over:`, `Narration:`, `Script:`
  - strips leading filler like `um`, `testing`, `one two`
  - if `Happy birthday...` starts shortly after filler, it cuts directly to that phrase
- The previous extra appended line (`Happy birthday!`) was removed so TTS uses only the cleaned generated script.
- Script generation prompt now asks OpenAI for roughly 28-38 words / 12-14 seconds so it fits a 15-second video.

### Music

- Default mux music asset is now `public/audio/party-music.mp3`.
- That MP3 was copied from:
  `/Users/rodolforodriguez/Downloads/the_mountain-party-party-music-508031.mp3`
- The mux loops this track as needed with `-stream_loop -1`.
- `public/audio/LICENSE.md` documents the local supplied file and older CC0 candidate tracks.
- Current mix balance:
  - music volume: `0.14`
  - voice volume: `1.45`
  - voice compressor: `threshold=-20dB:ratio=3:attack=6:release=100`
  - limiter: `limit=0.95`

### Final MP4 Audio

- Final mux ignores the generated video's original audio track.
- It mixes only:
  - input 1: ElevenLabs narration
  - input 2: local party music
- This avoids background screams, generated chants, or any accidental source-video audio.

### FAL Provider Guardrails

The live FAL issue was not just generic `Unprocessable Entity`; raw provider errors showed:

- Kling v3 prompt must be <= 512 characters.
- Kling v3 total duration must be <= 15 seconds.
- Uploaded image minimum dimensions must be at least 300x300.

The code now:

- compacts Kling prompts to the provider character limit
- caps v3 duration
- has conservative retry payloads
- preprocesses oversized image data URLs for FAL upload-size limits

## Files Changed

- `components/creation-form.tsx`
  - Shorter voice sample guidance.
  - Video length options updated around 15 seconds.

- `lib/defaults.ts`
  - Default advanced video length changed from 30 seconds to 15 seconds.

- `lib/plan-service.ts`
  - Caption generation prompt now targets 12-14 seconds / 28-38 words.

- `lib/agent-plan.ts`
  - Mock plan caption approach now describes a 12-15 second script.

- `lib/video-service.ts`
  - FAL prompt/duration guardrails.
  - Final mux duration extension logic.
  - ElevenLabs TTS cleanup.
  - Local party music asset selection.
  - Narration-forward audio mix.

- `tests/video-service.test.ts`
  - Coverage for TTS text cleanup, 15-second target, FAL guardrails, and voice sample behavior.

- `tests/creation-form.test.tsx`
  - Updated voice sample helper text expectation.

- `public/audio/`
  - `party-music.mp3` is the current default music bed.
  - `LICENSE.md` documents audio asset provenance.
  - Older CC0 candidate tracks may also exist locally.

## Validation Already Run

Recent checks passed locally:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- ffmpeg smoke tests for muxing narration + party music

## Notes for Next Agent

- If changing audio again, keep the invariant that final voiced MP4 audio must be narration + local party music only.
- Do not re-enable native/generated FAL audio when a voice sample exists.
- If live FAL returns `Unprocessable Entity`, inspect the raw `fal.queue.result` error body; some validations surface only on result retrieval after a request appears completed.
- The current branch already tracks broader work from an earlier commit named `Remove birthday autopilot flow`; review against `origin/main` if you need the full branch context, not just the uncommitted diff.

