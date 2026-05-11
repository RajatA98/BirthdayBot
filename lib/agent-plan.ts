import { getOccasionConfig, occasionFromDraft } from "@/lib/occasions";
import { DraftRequest, AgentPlan, PhotoAnalysis } from "@/lib/types";

export function buildMockPlan(
  input: DraftRequest,
  analysis: PhotoAnalysis
): AgentPlan {
  const occasion = getOccasionConfig(occasionFromDraft(input));
  const isMothersDay = occasion.id === "mothers-day";
  const isBirthday = occasion.id === "birthday";
  const isGeneral = occasion.id === "general";

  const subjectFallback = isMothersDay
    ? "a quiet Mother's Day moment"
    : isBirthday
      ? "a birthday moment"
      : "a personal video message";
  const subject = input.prompt.trim() || subjectFallback;
  const tone = input.mode === "advanced" ? input.advanced.tone : "Heartfelt";
  const sceneIdea =
    input.mode === "advanced"
      ? input.advanced.sceneIdea
      : isMothersDay
        ? "Mother's Day tribute"
        : isBirthday
          ? "Birthday party"
          : "Personal message";
  const motion =
    input.mode === "advanced"
      ? input.advanced.motionIntensity
      : "Moderate";

  return {
    title: isMothersDay
      ? `${tone} Mother's Day moment`
      : isBirthday
        ? `${tone} birthday reveal`
        : `${tone} video message`,
    concept: isMothersDay
      ? `Turn the uploaded photo into a tender Mother's Day tribute centered on ${subject}.`
      : isBirthday
        ? `Turn the uploaded photo into a cinematic birthday beat centered on ${subject}.`
        : `Turn the uploaded photo into a short cinematic video message centered on ${subject}.`,
    vibe: `${tone} with a polished, sendable emotional arc.`,
    sceneDirection: `Use ${sceneIdea.toLowerCase()} as the visual anchor while keeping the people recognizable.`,
    motionDirection: isMothersDay
      ? `${motion} camera motion with gentle reframing and a soft, nostalgic energy.`
      : isBirthday
        ? `${motion} camera motion with gentle reframing and birthday-moment energy.`
        : `${motion} camera motion with gentle reframing that matches the tone of the user's prompt.`,
    captionApproach: isMothersDay
      ? "Write a tender ~12-second Mother's Day script that feels personal, grateful, and easy to send."
      : isBirthday
        ? "Write a polished 12-15 second birthday script that feels warm, direct, and easy to send."
        : "Write a short ~10-12 second personal video-message script. No 'Happy ___' greeting unless it fits the prompt; lead with the relationship and the moment.",
    generationStrategy: "Start close to the original photo, then elevate it with cinematic motion and atmosphere.",
    keepFromPhoto: [
      "Facial identity and recognizable clothing cues",
      "The feeling of closeness between the people",
      "The core composition of the original photo"
    ],
    surpriseFactor: isMothersDay
      ? "Add a tender, gift-like feel without drifting from the people in the photo."
      : isBirthday
        ? "Add a polished birthday-movie feel without drifting so far that the people stop feeling real."
        : "Add a small premium touch (light, motion, atmosphere) that elevates the moment without changing the people.",
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
      isMothersDay,
      isGeneral
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

  if (occasion.id === "general") {
    // No "Happy ___" lead — this is a generic personalized message.
    return name
      ? `${name}, just wanted to send something a little better than a text. Thinking of you.`
      : `Just wanted to send something a little better than a text. Thinking of you.`;
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
  isMothersDay,
  isGeneral
}: {
  subject: string;
  tone: string;
  analysis: PhotoAnalysis;
  sceneIdea: string;
  motion: string;
  isMothersDay: boolean;
  isGeneral: boolean;
}) {
  return [
    isMothersDay
      ? `Direct this like a tender Mother's Day short film.`
      : isGeneral
        ? `Direct this like a short, sendable personal video message.`
        : `Direct this like a premium birthday short film.`,
    `Scene: ${subject} with a ${tone.toLowerCase()} emotional beat, grounded in the original photo and influenced by ${sceneIdea.toLowerCase()}.`,
    `Subject motion: preserve exactly ${analysis.subjectCount} people from the source image and animate them with ${motion.toLowerCase()} natural ${isMothersDay ? "tender" : isGeneral ? "" : "celebration"} energy, subtle smiles, gentle gesture changes, and realistic body motion.`,
    `Camera: elegant slow push or drift, cinematic reframing, stable premium composition.`,
    `Lighting: ${isMothersDay ? "warm golden-hour light with a soft nostalgic feel" : isGeneral ? "warm cinematic light that matches the mood of the prompt" : "warm polished birthday atmosphere"} and believable highlights and soft cinematic depth.`,
    `Important details: ${[
      ...analysis.identityAnchors,
      ...analysis.clothingAnchors,
      ...analysis.compositionAnchors
    ].join("; ")}.`,
    `Constraints: preserve the original cast only. Keep faces, hair, clothing, body proportions, and left-right positions recognizable. Do not add, remove, duplicate, or replace any person. Keep the scene faithful to the uploaded photo.`
  ].join("\n");
}
