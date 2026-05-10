import { DraftRequest, AgentPlan } from "@/lib/types";

export function buildMockPlan(input: DraftRequest): AgentPlan {
  const subject = input.prompt.trim() || "a birthday moment";
  const tone = input.mode === "advanced" ? input.advanced.tone : "Heartfelt";
  const sceneIdea =
    input.mode === "advanced" ? input.advanced.sceneIdea : "Rooftop city glow";
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
    captionApproach: "Write a personal birthday note that feels warm, direct, and easy to send.",
    generationStrategy: "Start close to the original photo, then elevate it with cinematic motion and atmosphere.",
    keepFromPhoto: [
      "Facial identity and recognizable clothing cues",
      "The feeling of closeness between the two people",
      "The core composition of the original photo"
    ],
    surpriseFactor: "Add a polished birthday-movie feel without drifting so far that the people stop feeling real.",
    subjectCount: 2,
    identityAnchors: [
      "Person 1 remains the left-side subject from the source photo",
      "Person 2 remains the right-side subject from the source photo",
      "Keep faces, hair, and clothing recognizable"
    ],
    sceneGuardrails: [
      "Preserve exactly the people visible in the source image",
      "Keep the original scene grounded in the uploaded photo",
      "Do not invent a new cast or swap identities"
    ],
    safePrompt: `Animate the source image into a short cinematic birthday video. Preserve exactly 2 people from the uploaded image. Keep their identities, faces, hair, clothing, body proportions, and positions recognizable. Do not add, remove, duplicate, or replace any person. Keep the original scene grounded in the source image. User intent: ${subject}. Add subtle natural motion, realistic celebration energy, and a polished birthday atmosphere while staying faithful to the source photo.`,
    negativePrompt:
      "No extra people. No duplicate person. No identity drift. No face replacement. No gender swap. No outfit replacement. No subject removal. No scene rewrite that removes one of the original people."
  };
}

export function buildMockCaption(input: DraftRequest, plan: AgentPlan) {
  const opening =
    input.mode === "advanced" && input.advanced.tone === "Funny"
      ? "Happy birthday to the chaos partner I would still choose every time."
      : "Happy birthday to one of my favorite people.";

  return `${opening} I wanted this to feel a little more personal than a normal text, so I turned one of our moments into a mini birthday movie. Hope your day feels as good as the memories that made this possible.`;
}
