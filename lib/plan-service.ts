import OpenAI from "openai";

import { buildMockCaption, buildMockPlan } from "@/lib/agent-plan";
import { getLangfuse } from "@/lib/langfuse";
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
  const langfuse = getLangfuse();

  const trace = langfuse?.trace({
    name: "plan-generation",
    input: { prompt: input.prompt, mode: input.mode },
    metadata: { mode: input.mode, advanced: input.advanced }
  });

  if (!apiKey) {
    const plan = buildMockPlan(input);
    const caption = buildMockCaption(input, plan);
    trace?.update({ output: { plan, caption }, metadata: { source: "mock" } });
    await langfuse?.flushAsync();
    return { plan, caption, source: "mock" as const };
  }

  const client = new OpenAI({ apiKey });
  const planModel = process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini";
  const captionModel = process.env.OPENAI_CAPTION_MODEL || "gpt-4.1-mini";
  const prompt = [
    "You are BirthdayBot's planning agent.",
    "Analyze the uploaded shared birthday photo and the user prompt.",
    "Return a concise cinematic generation plan.",
    "Keep the people recognizable.",
    `Mode: ${input.mode}`,
    `Birthday name: ${input.birthdayName || "Not provided"}`,
    `User prompt: ${input.prompt}`,
    `Advanced settings: ${JSON.stringify(input.advanced)}`
  ].join("\n");

  const planGen = trace?.generation({
    name: "plan",
    model: planModel,
    input: [{ role: "user", content: prompt }]
  });

  const planResponse = await client.responses.create({
    model: planModel,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: input.photoDataUrl, detail: "auto" }
        ]
      }
    ],
    text: { format: { type: "json_schema", ...jsonSchema } }
  });

  const plan = JSON.parse(planResponse.output_text);
  planGen?.end({
    output: plan,
    usage: {
      input: planResponse.usage?.input_tokens,
      output: planResponse.usage?.output_tokens
    }
  });

  const captionPrompt = `Write a polished birthday voice-over script for ${input.birthdayName || "the birthday person"} that matches this plan: ${JSON.stringify(plan)}. Make it warm, specific, sendable, and natural. Target about 30 seconds when read aloud, roughly 65-85 words. Return only the script text.`;
  const captionGen = trace?.generation({
    name: "caption",
    model: captionModel,
    input: [{ role: "user", content: captionPrompt }]
  });

  const captionResponse = await client.responses.create({
    model: captionModel,
    input: [{ role: "user", content: [{ type: "input_text", text: captionPrompt }] }]
  });

  const caption = captionResponse.output_text.trim();
  captionGen?.end({
    output: caption,
    usage: {
      input: captionResponse.usage?.input_tokens,
      output: captionResponse.usage?.output_tokens
    }
  });

  trace?.update({ output: { plan, caption }, metadata: { source: "openai" } });
  await langfuse?.flushAsync();

  return { plan, caption, source: "openai" as const };
}
