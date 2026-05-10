import OpenAI from "openai";

import { DraftRequest, AgentPlan, PhotoAnalysis } from "@/lib/types";
import { buildMockCaption, buildMockPlan } from "@/lib/agent-plan";

const jsonSchema = {
  name: "birthday_agent_plan",
  schema: {
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
  },
  strict: true
} as const;

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
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are BirthdayBot's film director planning tool.",
                "Turn the user one-liner into a premium but safe birthday-video direction.",
                "You are directing the real people already in frame, not inventing a new cast.",
                "Use the provided photo analysis as hard guardrails.",
                "Create a visible plan plus a strict internal prompt for the downstream video model.",
                "Write the internal prompt like a director briefing a small film crew.",
                "Structure the internal prompt with sections for Scene, Subject motion, Camera, Lighting, Important details, and Constraints.",
                "Keep the internal prompt concrete, visual, and compact rather than repetitive.",
                `Photo analysis: ${JSON.stringify(analysis)}`,
                `Mode: ${input.mode}`,
                `User prompt: ${input.prompt}`,
                `Advanced settings: ${JSON.stringify(input.advanced)}`
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          ...jsonSchema
        }
      }
    });

    const plan = JSON.parse(response.output_text) as AgentPlan;
    const captionResponse = await client.responses.create({
      model: process.env.OPENAI_CAPTION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Write a short, personal birthday caption that matches this plan: ${JSON.stringify(
                plan
              )}. Keep it heartfelt, sendable, and natural.`
            }
          ]
        }
      ]
    });

    return {
      plan,
      caption: captionResponse.output_text.trim(),
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
