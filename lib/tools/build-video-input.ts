import { getOccasionConfig, occasionFromDraft } from "@/lib/occasions";
import { DraftRequest, PlanRecord } from "@/lib/types";

// Live cap fal/kling enforces is 2500 chars; older v3 builds capped at 512.
// We stay safely under both so the request is never rejected for length, and
// callers can override via FAL_PROMPT_CHAR_LIMIT for endpoints with stricter
// limits.
const defaultPromptCharLimit = 2400;

type FalVideoInput = {
  prompt: string;
  image_url?: string;
  start_image_url?: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  generate_audio?: boolean;
};

export type BuildFalOptions = {
  safeRetry?: boolean;
};

export function buildFalInput(
  endpoint: string,
  imageUrl: string,
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string,
  options: BuildFalOptions = {}
): FalVideoInput {
  const input: FalVideoInput = supportsStartImageUrl(endpoint)
    ? {
        start_image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption, options)
      }
    : {
        image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption, options)
      };

  input.duration = durationForEndpoint(endpoint, draft);
  input.aspect_ratio = aspectRatioForDraft(draft);
  // Safe retry: keep the negative prompt minimal so the input payload is
  // as plain as possible. Drop the plan-extension flourishes that may
  // have triggered fal's content moderation on attempt 1.
  const occasion = getOccasionConfig(occasionFromDraft(draft));
  input.negative_prompt = options.safeRetry
    ? [
        "any on-screen text, captions, subtitles, watermark, logo, distorted hands, extra faces, changed identity, different people, replacement actors, stock-footage people, new characters, subject swap, anonymous athletes, anonymous runners, generic crowd",
        occasion.negativePromptExtras
      ]
        .filter(Boolean)
        .join(", ")
    : [
        "any on-screen text, captions, subtitles, lower thirds, title cards, words, letters, signage with words, written messages, name tags, watermark, logo",
        "blur, distort, low quality, distorted hands, extra faces, changed identity",
        "different people from the source photo, replacement actors, body double, stock-footage people, generic athletes, generic runners, generic triathletes, anonymous athletes, anonymous runners, anonymous models, generic models, new characters appearing mid-shot, subject swap during transition, scene cut to unrelated people, faceless people, back of head only of new people",
        occasion.negativePromptExtras,
        plan.negativePrompt
      ]
        .filter(Boolean)
        .join(", ");
  // Lower cfg on safe retry → looser interpretation → better acceptance
  // odds for borderline prompts.
  input.cfg_scale = options.safeRetry ? 0.5 : 0.65;

  // ElevenLabs always carries the voice (TTS narration, S2S Voice Changer,
  // or sung birthday song). Asking fal for native audio just adds gibberish
  // celebratory sound that has to be stripped during mux — and if mux fails
  // for any reason, that gibberish leaks through to the preview/download.
  // Keep fal silent unconditionally.
  void supportsNativeAudio;
  return input;
}

export function buildFalPrompt(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption = "",
  options: BuildFalOptions = {}
) {
  const textDirection = buildTextDirection(draft, caption);
  const musicDirection = buildMusicDirection(draft);
  const safePrompt = "safePrompt" in plan && typeof plan.safePrompt === "string"
    ? `Internal direction: ${plan.safePrompt}`
    : undefined;
  const guardrails =
    "sceneGuardrails" in plan && Array.isArray(plan.sceneGuardrails)
      ? `Scene guardrails: ${plan.sceneGuardrails.join("; ")}.`
      : undefined;

  const occasion = getOccasionConfig(occasionFromDraft(draft));
  const isMothersDay = occasion.id === "mothers-day";
  // Per-occasion celebration line — for birthdays it's party tropes (cake,
  // balloons, confetti); for Mother's Day it's tender tropes (warm light,
  // small gestures). Keeps the visual feel matched to the occasion.
  const celebrationLine = isMothersDay
    ? "Make the video feel like a tender Mother's Day moment with intimate, sendable details — warm sunlight, a small touch of nostalgia, a hug or shared look or quiet smile when it fits the scene. Avoid generic birthday-party tropes (no cake, no candles, no balloons, no confetti) unless the user prompt explicitly asks for them."
    : "Make the video clearly feel like a birthday celebration with tasteful party details such as candles, cake, balloons, confetti, gifts, warm smiles, celebratory lighting, or a joyful reveal when they fit the scene.";

  // Safe retry: drop the verbose user-direction layer entirely and ride on
  // the plan's internal `safePrompt` plus identity guardrails. The first
  // attempt's prompt was rejected by fal — try a tighter, more neutral
  // payload before giving up.
  if (options.safeRetry) {
    const joined = [
      occasion.sceneOpeningLine,
      safePrompt,
      "Keep the people recognizable and preserve identity, facial features, clothing cues, and the relationship shown in the source photo.",
      guardrails,
      textDirection,
      musicDirection,
      "Avoid text artifacts, watermarks, distorted hands, extra faces, or changing the subject's identity."
    ]
      .filter(Boolean)
      .join(" ");
    return capPromptLength(joined);
  }

  const advancedDirection =
    draft.mode === "advanced"
      ? [
          `Tone: ${draft.advanced.tone}`,
          `Scene idea: ${draft.advanced.sceneIdea}`,
          `Length target: ${draft.advanced.videoLength}`,
          `Aspect ratio: ${draft.advanced.aspectRatio}`,
          `Music vibe: ${draft.advanced.musicVibe}`,
          `Motion intensity: ${draft.advanced.motionIntensity}`
        ].join(". ")
      : isMothersDay
        ? "Use a warm, sendable Mother's-Day-tribute style."
        : "Use a warm, sendable birthday-video style.";
  const isSpeakYourself = draft.voiceMode === "speak-yourself";
  const audioDelivery = isSpeakYourself
    ? `The voice-over is the user's OWN spoken ${isMothersDay ? "Mother's Day message" : "birthday message"} (preserved through ElevenLabs Voice Changer). The video should match the natural timing, tone, and emotional energy of a real spoken message — let small pauses breathe, keep camera moves grounded, and let the visual beats land on the cadence of natural speech rather than overrun it.`
    : undefined;

  const cast = Array.isArray(plan.identityAnchors) && plan.identityAnchors.length > 0
    ? `ON-SCREEN CAST (only people allowed): ${plan.identityAnchors
        .map((anchor, index) => `Person ${index + 1}: ${anchor}`)
        .join(". ")}. These ${plan.identityAnchors.length} people are the only characters in any frame — never replaced, never joined by extras, never swapped during transitions or wide shots.`
    : undefined;

  const joined = [
    occasion.sceneOpeningLine,
    "FIRST FRAME ANCHOR: Begin with the uploaded source photo as frame 0; animate from that exact frame. The same faces, hair, skin tone, body types, outfits, and relative positions persist across every subsequent frame.",
    "IDENTITY LOCK: The on-screen subjects must remain the exact same people from the source photo through every frame, transition, and camera move. Never replace them with stock actors, generic athletes, anonymous runners, or new characters. The user prompt below describes the SCENE around them, not a different cast — the cast does NOT change to match the prompt; the scene adapts around the cast.",
    cast,
    `User video prompt: ${draft.prompt}`,
    "Treat the user video prompt as creative scene direction, never at the expense of IDENTITY LOCK above.",
    textDirection,
    musicDirection,
    audioDelivery,
    celebrationLine,
    `Concept: ${plan.concept}`,
    `Scene direction: ${plan.sceneDirection}`,
    `Motion direction: ${plan.motionDirection}`,
    `Generation strategy: ${plan.generationStrategy}`,
    `Advanced direction: ${advancedDirection}`,
    `Keep these cues from the photo: ${plan.keepFromPhoto.join("; ")}.`,
    guardrails,
    safePrompt,
    "Avoid text artifacts, watermarks, distorted hands, extra faces, or changing the subject's identity."
  ]
    .filter(Boolean)
    .join(" ");

  return capPromptLength(joined);
}

function capPromptLength(prompt: string, max = defaultPromptCharLimit) {
  if (prompt.length <= max) return prompt;

  const slice = prompt.slice(0, max);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? ")
  );

  if (lastSentenceEnd > max * 0.6) {
    return slice.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

function buildTextDirection(draft: DraftRequest, caption: string) {
  void draft;
  void caption;
  return "Do not render any text, captions, titles, lower thirds, signage with words, or written messages anywhere in the frame. The 'Happy Birthday' title is added as a clean post-process overlay outside the model, and the spoken voice-over carries the message — keep every frame text-free.";
}

function buildMusicDirection(draft: DraftRequest) {
  const musicVibe =
    draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting";

  if (draft.voiceMode === "song") {
    return `Do not generate any spoken narration, synthetic dialogue, or native soundtrack audio. Leave the MP4 audio-free — a custom ${draft.songStyle || "acoustic"}-style birthday song will be muxed in as the entire audio track after generation. The video should pulse with the energy of a music video.`;
  }

  if (hasVoiceSample(draft)) {
    return "Do not generate spoken narration, synthetic dialogue, or native soundtrack audio. Leave the MP4 audio-free because the user's cloned ElevenLabs narration will be muxed into the final video after generation.";
  }

  return `Generate native audio in the final MP4 with a ${musicVibe.toLowerCase()} birthday music bed that matches the scene. Keep it as background music or ambient celebration audio, with no spoken narration unless the user explicitly asks for dialogue.`;
}

function durationForEndpoint(endpoint: string, draft: DraftRequest) {
  const requested =
    draft.mode === "advanced" ? draft.advanced.videoLength : "10 seconds";
  const seconds = requested.match(/\d+/)?.[0] || "10";

  if (seconds === "15" && !supportsLongDurations(endpoint)) {
    return "10";
  }

  return seconds;
}

function aspectRatioForDraft(draft: DraftRequest) {
  const aspectRatio =
    draft.mode === "advanced" ? draft.advanced.aspectRatio : "Portrait";

  switch (aspectRatio) {
    case "Landscape":
      return "16:9";
    case "Square":
      return "1:1";
    case "Portrait":
    default:
      return "9:16";
  }
}

function hasVoiceSample(draft: DraftRequest) {
  return Boolean(draft.voiceSampleDataUrl);
}

function supportsStartImageUrl(endpoint: string) {
  return /\/v(2\.6|3)|\/master\//.test(endpoint);
}

function supportsNativeAudio(endpoint: string) {
  return /\/v(2\.6|3)|\/master\//.test(endpoint);
}

function supportsLongDurations(endpoint: string) {
  return /\/v3|\/master\//.test(endpoint);
}
