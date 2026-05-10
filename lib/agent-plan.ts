import { DraftRequest, AgentPlan, PhotoAnalysis } from "@/lib/types";

export function buildMockPlan(
  input: DraftRequest,
  analysis: PhotoAnalysis
): AgentPlan {
  const subject = input.prompt.trim() || "a birthday moment";
  const tone = input.mode === "advanced" ? input.advanced.tone : "Heartfelt";
  const sceneIdea =
    input.mode === "advanced" ? input.advanced.sceneIdea : "Birthday party";
  const motion =
    input.mode === "advanced"
      ? input.advanced.motionIntensity
      : "Moderate";

  return {
    title: `${tone} birthday reveal`,
    concept: `Turn the uploaded photo into a cinematic birthday beat centered on ${subject}.`,
    vibe: `${tone} with a polished, sendable emotional arc.`,
    sceneDirection: `Use ${sceneIdea.toLowerCase()} as the visual anchor while keeping the people recognizable.`,
    motionDirection: `${motion} camera motion with gentle reframing and birthday-moment energy.`,
    captionApproach: "Write a polished 12-15 second birthday script that feels warm, direct, and easy to send.",
    generationStrategy: "Start close to the original photo, then elevate it with cinematic motion and atmosphere.",
    keepFromPhoto: [
      "Facial identity and recognizable clothing cues",
      "The feeling of closeness between the two people",
      "The core composition of the original photo"
    ],
    surpriseFactor: "Add a polished birthday-movie feel without drifting so far that the people stop feeling real.",
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
      motion
    }),
    negativePrompt:
      "No extra people. No duplicate person. No identity drift. No face replacement. No gender swap. No outfit replacement. No subject removal. No scene rewrite that removes one of the original people.",
    narrationVoiceCue: "warm American female, intimate"
  };
}

export function buildMockCaption(input: DraftRequest, plan: AgentPlan) {
  const name = input.birthdayName?.trim();
  const opening =
    input.mode === "advanced" && input.advanced.tone === "Funny"
      ? `${name ? `Happy birthday ${name}. You are` : "Happy birthday to"} the chaos partner I would still choose every time.`
      : `${name ? `Happy birthday ${name}. You are` : "Happy birthday to"} one of my favorite people.`;

  return `${opening} I wanted this to feel more personal than a normal text, so I turned one of our moments into a mini birthday movie. I hope this year gives you the kind of surprises that make you pause, laugh, and feel deeply loved. You deserve a day full of good stories, real joy, and people who show up for you. Happy birthday.`;
}

function buildDirectorPrompt({
  subject,
  tone,
  analysis,
  sceneIdea,
  motion
}: {
  subject: string;
  tone: string;
  analysis: PhotoAnalysis;
  sceneIdea: string;
  motion: string;
}) {
  return [
    `Direct this like a premium birthday short film.`,
    `Scene: ${subject} with a ${tone.toLowerCase()} emotional beat, grounded in the original photo and influenced by ${sceneIdea.toLowerCase()}.`,
    `Subject motion: preserve exactly ${analysis.subjectCount} people from the source image and animate them with ${motion.toLowerCase()} natural celebration energy, subtle smiles, gentle gesture changes, and realistic body motion.`,
    `Camera: elegant slow push or drift, cinematic reframing, stable premium composition.`,
    `Lighting: warm polished birthday atmosphere with believable highlights and soft cinematic depth.`,
    `Important details: ${[
      ...analysis.identityAnchors,
      ...analysis.clothingAnchors,
      ...analysis.compositionAnchors
    ].join("; ")}.`,
    `Constraints: preserve the original cast only. Keep faces, hair, clothing, body proportions, and left-right positions recognizable. Do not add, remove, duplicate, or replace any person. Keep the scene faithful to the uploaded photo.`
  ].join("\n");
}
