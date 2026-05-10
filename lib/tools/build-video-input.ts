import { DraftRequest, PlanRecord } from "@/lib/types";

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

export function buildFalInput(
  endpoint: string,
  imageUrl: string,
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string
): FalVideoInput {
  const input: FalVideoInput = supportsStartImageUrl(endpoint)
    ? {
        start_image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption)
      }
    : {
        image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption)
      };

  input.duration = durationForEndpoint(endpoint, draft);
  input.aspect_ratio = aspectRatioForDraft(draft);
  input.negative_prompt = [
    "blur, distort, low quality, watermark, misspelled text, broken letters, garbled caption, distorted hands, extra faces, changed identity",
    plan.negativePrompt
  ]
    .filter(Boolean)
    .join(", ");
  input.cfg_scale = 0.65;

  if (supportsNativeAudio(endpoint) && !hasVoiceSample(draft)) {
    input.generate_audio = true;
  }

  return input;
}

export function buildFalPrompt(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption = ""
) {
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
      : "Use a warm, sendable birthday-video style.";
  const textDirection = buildTextDirection(draft, caption);
  const musicDirection = buildMusicDirection(draft);
  const safePrompt = "safePrompt" in plan && typeof plan.safePrompt === "string"
    ? `Internal direction: ${plan.safePrompt}`
    : undefined;
  const guardrails =
    "sceneGuardrails" in plan && Array.isArray(plan.sceneGuardrails)
      ? `Scene guardrails: ${plan.sceneGuardrails.join("; ")}.`
      : undefined;

  return [
    "Create a short cinematic birthday celebration video from the uploaded photo.",
    `User video prompt: ${draft.prompt}`,
    "Treat the user video prompt as the main creative direction for the generated video.",
    textDirection,
    musicDirection,
    "Make the video clearly feel like a birthday celebration with tasteful party details such as candles, cake, balloons, confetti, gifts, warm smiles, celebratory lighting, or a joyful reveal when they fit the scene.",
    "Keep the people recognizable and preserve identity, facial features, clothing cues, and the relationship shown in the source photo.",
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
}

function buildTextDirection(draft: DraftRequest, caption: string) {
  const style =
    draft.mode === "advanced" && draft.advanced.captionStyle !== "None"
      ? draft.advanced.captionStyle.toLowerCase()
      : "subtle";
  const text = birthdayOverlayText(caption);

  return `Embed tasteful ${style} on-screen birthday text directly in the video frames, not as a separate caption outside the video. Show a warm "Happy Birthday!" title followed by this compact 2-3 sentence message: "${text}". Use celebratory text effects: gold, coral, and champagne gradient lettering, gentle shimmer, soft glow, subtle scale-in reveal, and tiny confetti or sparkle accents. Avoid plain white text.`;
}

function buildMusicDirection(draft: DraftRequest) {
  const musicVibe =
    draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting";

  if (hasVoiceSample(draft)) {
    return "Do not generate spoken narration, synthetic dialogue, or native soundtrack audio. Leave the MP4 audio-free because the user's cloned ElevenLabs narration will be muxed into the final video after generation.";
  }

  return `Generate native audio in the final MP4 with a ${musicVibe.toLowerCase()} birthday music bed that matches the scene. Keep it as background music or ambient celebration audio, with no spoken narration unless the user explicitly asks for dialogue.`;
}

function birthdayOverlayText(caption: string) {
  const fallback = "Happy Birthday! Hope your day feels as special as you are.";
  const normalized = compactCaptionText(caption || fallback).replaceAll('"', "'");

  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trim()}...`;
}

function compactCaptionText(caption: string) {
  const sentences = caption
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences?.length) {
    return "Happy Birthday! Hope your day feels as special as you are.";
  }

  return sentences.slice(0, 3).join(" ");
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
