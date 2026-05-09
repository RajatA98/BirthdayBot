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
    surpriseFactor: "Add a polished birthday-movie feel without drifting so far that the people stop feeling real."
  };
}

export function buildMockCaption(input: DraftRequest, plan: AgentPlan) {
  const opening =
    input.mode === "advanced" && input.advanced.tone === "Funny"
      ? "Happy birthday to the chaos partner I would still choose every time."
      : "Happy birthday to one of my favorite people.";

  return `${opening} I wanted this to feel a little more personal than a normal text, so I turned one of our moments into a mini birthday movie. Hope your day feels as good as the memories that made this possible.`;
}
