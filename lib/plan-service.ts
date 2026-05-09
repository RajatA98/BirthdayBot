import OpenAI from "openai";

import { buildMockCaption, buildMockPlan } from "@/lib/agent-plan";
import { DraftRequest } from "@/lib/types";

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
      "surpriseFactor"
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
      surpriseFactor: { type: "string" }
    }
  },
  strict: true
} as const;

export async function generatePlanAndCaption(input: DraftRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const plan = buildMockPlan(input);
    return {
      plan,
      caption: buildMockCaption(input, plan),
      source: "mock" as const
    };
  }

  const client = new OpenAI({ apiKey });
  const prompt = [
    "You are BirthdayBot's planning agent.",
    "Analyze the uploaded shared birthday photo and the user prompt.",
    "Return a concise cinematic generation plan.",
    "Keep the people recognizable.",
    `Mode: ${input.mode}`,
    `User prompt: ${input.prompt}`,
    `Advanced settings: ${JSON.stringify(input.advanced)}`
  ].join("\n");

  const planResponse = await client.responses.create({
    model: process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: input.photoDataUrl,
            detail: "auto"
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

  const plan = JSON.parse(planResponse.output_text);

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
}
