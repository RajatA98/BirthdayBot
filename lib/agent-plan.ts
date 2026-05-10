import { DraftRequest, AgentPlan } from "@/lib/types";

export function buildMockPlan(input: DraftRequest): AgentPlan {
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
    captionApproach: "Write a polished 30-second birthday script that feels warm, direct, and easy to send.",
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
  const name = input.birthdayName?.trim();
  const opening =
    input.mode === "advanced" && input.advanced.tone === "Funny"
      ? `${name ? `Happy birthday ${name}. You are` : "Happy birthday to"} the chaos partner I would still choose every time.`
      : `${name ? `Happy birthday ${name}. You are` : "Happy birthday to"} one of my favorite people.`;

  return `${opening} I wanted this to feel more personal than a normal text, so I turned one of our moments into a mini birthday movie. I hope this year gives you the kind of surprises that make you pause, laugh, and feel deeply loved. You deserve a day full of good stories, real joy, and people who show up for you. Happy birthday.`;
}
