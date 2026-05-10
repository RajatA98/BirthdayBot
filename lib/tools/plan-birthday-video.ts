import OpenAI from "openai";

import { DraftRequest, AgentPlan, PhotoAnalysis } from "@/lib/types";
import { buildMockCaption, buildMockPlan } from "@/lib/agent-plan";

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "concept",
    "vibe",
    "sceneDirection",
    "motionDirection",
    "captionApproach",
    "generationStrategy",
    "keepFromPhoto",
    "surpriseFactor",
    "subjectCount",
    "identityAnchors",
    "sceneGuardrails",
    "safePrompt",
    "negativePrompt"
  ],
  properties: {
    title: { type: "string" },
    concept: { type: "string" },
    vibe: { type: "string" },
    sceneDirection: { type: "string" },
    motionDirection: { type: "string" },
    captionApproach: { type: "string" },
    generationStrategy: { type: "string" },
    keepFromPhoto: {
      type: "array",
      items: { type: "string" },
      minItems: 2
    },
    surpriseFactor: { type: "string" },
    subjectCount: { type: "integer", minimum: 1, maximum: 6 },
    identityAnchors: {
      type: "array",
      items: { type: "string" },
      minItems: 1
    },
    sceneGuardrails: {
      type: "array",
      items: { type: "string" },
      minItems: 1
    },
    safePrompt: { type: "string" },
    negativePrompt: { type: "string" }
  }
} as const;

const combinedSchema = {
  name: "birthday_plan_and_caption",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["plan", "caption"],
    properties: {
      plan: planSchema,
      caption: {
        type: "string",
        description:
          "Short, personal birthday voice-over script. 28-38 words, ~12-14 seconds when read aloud, warm, sendable, and natural."
      }
    }
  },
  strict: true
} as const;

const systemInstructions = [
  "You are BirthdayBot's film director planning tool.",
  "Your job: turn a one-line user prompt and a photo analysis into a premium but safe birthday-video direction AND a matching voice-over script in a single response.",
  "",
  "Plan rules:",
  "- You are directing the real people already in frame, not inventing a new cast.",
  "- Use the provided photo analysis as hard guardrails for identity, clothing, and composition.",
  "- The visible plan (title, concept, vibe, sceneDirection, motionDirection, captionApproach, generationStrategy, keepFromPhoto, surpriseFactor) is what the user sees and approves.",
  "- The internal prompt (safePrompt) is the structured director briefing the downstream video model. Write it like a small film crew briefing with sections for Scene, Subject motion, Camera, Lighting, Important details, and Constraints.",
  "- Keep safePrompt concrete, visual, and compact — not repetitive.",
  "- negativePrompt should explicitly forbid identity drift, extra people, face swap, gender swap, outfit replacement, and subject removal.",
  "- subjectCount and identityAnchors must echo the photo analysis exactly.",
  "- sceneGuardrails are explicit safety rails: 'Preserve exactly N people', 'No identity drift', etc.",
  "",
  "Caption rules:",
  "- Write a heartfelt, sendable birthday voice-over script that matches the plan.",
  "- Target 28-38 words so it reads in ~12-14 seconds aloud (fits a 15-second video).",
  "- Address the birthday person directly when their name is provided.",
  "- Warm and natural, not generic. Avoid emoji, hashtags, or markdown.",
  "- Single paragraph, ending with 'Happy birthday' or similar warm close.",
  "",
  "Respond ONLY with the structured JSON output described by the schema."
].join("\n");

export async function planBirthdayVideo(
  input: DraftRequest,
  analysis: PhotoAnalysis
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const plan = buildMockPlan(input, analysis);
    return {
      plan,
      caption: buildMockCaption(input, plan),
      source: "mock" as const
    };
  }

  const client = new OpenAI({ apiKey });
  const userContext = [
    `Mode: ${input.mode}`,
    `Birthday name: ${input.birthdayName?.trim() || "Not provided"}`,
    `User prompt: ${input.prompt}`,
    `Advanced settings: ${JSON.stringify(input.advanced)}`,
    `Photo analysis: ${JSON.stringify(analysis)}`
  ].join("\n");

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: systemInstructions },
        { role: "user", content: userContext }
      ],
      text: {
        format: {
          type: "json_schema",
          ...combinedSchema
        }
      }
    });

    const parsed = JSON.parse(response.output_text) as {
      plan: AgentPlan;
      caption: string;
    };

    return {
      plan: parsed.plan,
      caption: parsed.caption.trim(),
      source: "openai" as const
    };
  } catch (error) {
    if (shouldFallbackToMockOpenAI(error)) {
      const plan = buildMockPlan(input, analysis);
      return {
        plan,
        caption: buildMockCaption(input, plan),
        source: "mock" as const
      };
    }

    throw error;
  }
}

function shouldFallbackToMockOpenAI(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = "status" in error ? Number(error.status) : undefined;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  return (
    status === 429 ||
    message.includes("quota") ||
    message.includes("billing") ||
    message.includes("rate limit")
  );
}
