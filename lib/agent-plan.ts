import { getOccasionConfig, occasionFromDraft } from "@/lib/occasions";
import { DraftRequest, AgentPlan, PhotoAnalysis } from "@/lib/types";

export function buildMockPlan(
  input: DraftRequest,
  analysis: PhotoAnalysis
): AgentPlan {
  const occasion = getOccasionConfig(occasionFromDraft(input));
  const isMothersDay = occasion.id === "mothers-day";
  const subjectFallback = isMothersDay
    ? "a quiet Mother's Day moment"
    : "a birthday moment";
  const subject = input.prompt.trim() || subjectFallback;
  const tone = input.mode === "advanced" ? input.advanced.tone : "Heartfelt";
  const sceneIdea =
    input.mode === "advanced"
      ? input.advanced.sceneIdea
      : isMothersDay
        ? "Mother's Day tribute"
        : "Birthday party";
  const motion =
    input.mode === "advanced"
      ? input.advanced.motionIntensity
      : "Moderate";

  return {
    title: isMothersDay
      ? `${tone} Mother's Day moment`
      : `${tone} birthday reveal`,
    concept: isMothersDay
      ? `Turn the uploaded photo into a tender Mother's Day tribute centered on ${subject}.`
      : `Turn the uploaded photo into a cinematic birthday beat centered on ${subject}.`,
    vibe: `${tone} with a polished, sendable emotional arc.`,
    sceneDirection: `Use ${sceneIdea.toLowerCase()} as the visual anchor while keeping the people recognizable.`,
    motionDirection: isMothersDay
      ? `${motion} camera motion with gentle reframing and a soft, nostalgic energy.`
      : `${motion} camera motion with gentle reframing and birthday-moment energy.`,
    captionApproach: isMothersDay
      ? "Write a tender ~12-second Mother's Day script that feels personal, grateful, and easy to send."
      : "Write a polished 12-15 second birthday script that feels warm, direct, and easy to send.",
    generationStrategy: "Start close to the original photo, then elevate it with cinematic motion and atmosphere.",
    keepFromPhoto: [
      "Facial identity and recognizable clothing cues",
      "The feeling of closeness between the people",
      "The core composition of the original photo"
    ],
    surpriseFactor: isMothersDay
      ? "Add a tender, gift-like feel without drifting from the people in the photo."
      : "Add a polished birthday-movie feel without drifting so far that the people stop feeling real.",
    subjectCount: analysis.subjectCount,
    identityAnchors: analysis.identityAnchors,
    sceneGuardrails: [
      "Preserve exactly the people visible in the source image",
      "Keep the original scene grounded in the uploaded photo",
      "Do not invent a new cast or swap identities"
    ],
    safePrompt: buildDirectorPrompt({
      subject,
      tone,
      analysis,
      sceneIdea,
      motion,
      isMothersDay
    }),
    negativePrompt: [
      "No extra people. No duplicate person. No identity drift. No face replacement. No gender swap. No outfit replacement. No subject removal. No scene rewrite that removes one of the original people.",
      occasion.negativePromptExtras
    ]
      .filter(Boolean)
      .join(" "),
    narrationVoiceCue: isMothersDay
      ? "warm American female, intimate, tender"
      : "warm American female, intimate"
  };
}

export function buildMockCaption(input: DraftRequest, plan: AgentPlan) {
  void plan;
  const occasion = getOccasionConfig(occasionFromDraft(input));
  const name = input.birthdayName?.trim();
  const isFunny = input.mode === "advanced" && input.advanced.tone === "Funny";

  if (occasion.id === "mothers-day") {
    return name
      ? `Happy Mother's Day, ${name}. Just wanted to send something that actually feels like a hug. Thank you for everything.`
      : `Happy Mother's Day. Just wanted to send something that actually feels like a hug. Thank you for everything.`;
  }

  if (isFunny) {
    return name
      ? `Happy birthday, ${name}. Chaos partner of the year, every year. Hope this one's a good one. Love you.`
      : `Happy birthday. Chaos partner of the year, every year. Hope this one's a good one. Love you.`;
  }

  return name
    ? `Happy birthday, ${name}. Just wanted to send something that actually feels like me. Hope this year's a great one.`
    : `Happy birthday. Just wanted to send something that actually feels like me. Hope this year's a great one.`;
}

function buildDirectorPrompt({
  subject,
  tone,
  analysis,
  sceneIdea,
  motion,
  isMothersDay
}: {
  subject: string;
  tone: string;
  analysis: PhotoAnalysis;
  sceneIdea: string;
  motion: string;
  isMothersDay: boolean;
}) {
  return [
    isMothersDay
      ? `Direct this like a tender Mother's Day short film.`
      : `Direct this like a premium birthday short film.`,
    `Scene: ${subject} with a ${tone.toLowerCase()} emotional beat, grounded in the original photo and influenced by ${sceneIdea.toLowerCase()}.`,
    `Subject motion: preserve exactly ${analysis.subjectCount} people from the source image and animate them with ${motion.toLowerCase()} natural ${isMothersDay ? "tender" : "celebration"} energy, subtle smiles, gentle gesture changes, and realistic body motion.`,
    `Camera: elegant slow push or drift, cinematic reframing, stable premium composition.`,
    `Lighting: ${isMothersDay ? "warm golden-hour light with a soft nostalgic feel" : "warm polished birthday atmosphere"} and believable highlights and soft cinematic depth.`,
    `Important details: ${[
      ...analysis.identityAnchors,
      ...analysis.clothingAnchors,
      ...analysis.compositionAnchors
    ].join("; ")}.`,
    `Constraints: preserve the original cast only. Keep faces, hair, clothing, body proportions, and left-right positions recognizable. Do not add, remove, duplicate, or replace any person. Keep the scene faithful to the uploaded photo.`
  ].join("\n");
}
