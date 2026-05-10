# Ops Update

- Date: 2026-05-09
- Branch: feature/birthdaybot-next
- Commit: pending

## Summary

Implemented the research-driven quality improvements in phases:

- refactored the backend into four explicit core tools:
  - `analyze_photo`
  - `plan_birthday_video`
  - `start_video_generation`
  - `check_video_generation`
- upgraded the default `fal` model from `kling v2.1 standard` to `kling v3 standard image-to-video`
- replaced the long internal prompt with a structured director-style prompt template
- strengthened photo analysis anchors and routed duration/aspect-ratio through the provider request
- fixed download by proxying the video through an app-owned download route

## Blockers Or Risks

- real output quality still depends on prompt tuning and model behavior on hard duo-photo cases
- local file-backed persistence is stable for dev but not production-grade

## Next Context

- use the browser flow on `http://localhost:3000` with real images to compare `kling v3` output quality
- if identity drift remains high, the next likely move is a stronger reference-capable `fal` workflow rather than more generic prompt text
