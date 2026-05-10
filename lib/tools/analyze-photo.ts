import OpenAI from "openai";

import { DraftRequest, PhotoAnalysis } from "@/lib/types";

const jsonSchema = {
  name: "birthday_photo_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "subjectCount",
      "identityAnchors",
      "clothingAnchors",
      "compositionAnchors",
      "mood",
      "sceneSummary"
    ],
    properties: {
      subjectCount: { type: "integer", minimum: 1, maximum: 6 },
      identityAnchors: {
        type: "array",
        items: { type: "string" },
        minItems: 1
      },
      clothingAnchors: {
        type: "array",
        items: { type: "string" },
        minItems: 1
      },
      compositionAnchors: {
        type: "array",
        items: { type: "string" },
        minItems: 1
      },
      mood: { type: "string" },
      sceneSummary: { type: "string" }
    }
  },
  strict: true
} as const;

export async function analyzePhoto(input: DraftRequest): Promise<PhotoAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildMockPhotoAnalysis();
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
                "You are BirthdayBot's photo analysis tool.",
                "Analyze the uploaded image for a birthday-video workflow.",
                "Count the visible people accurately.",
                "Describe identity anchors without naming unknown people.",
                "Describe clothing and composition details that should be preserved."
              ].join("\n")
            },
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

    return JSON.parse(response.output_text) as PhotoAnalysis;
  } catch (error) {
    if (shouldFallbackToMockOpenAI(error)) {
      return buildMockPhotoAnalysis();
    }

    throw error;
  }
}

function buildMockPhotoAnalysis(): PhotoAnalysis {
  return {
    subjectCount: 2,
    identityAnchors: [
      "Person 1 remains the left-side subject from the source photo with the same face and hairstyle",
      "Person 2 remains the right-side subject from the source photo with the same face and hairstyle"
    ],
    clothingAnchors: [
      "Preserve the recognizable outfit silhouettes from the source image",
      "Keep the main clothing colors and high-contrast details"
    ],
    compositionAnchors: [
      "Keep the original left-right positioning of the people",
      "Maintain the overall framing and closeness between the subjects",
      "Stay close to the original pose and gesture language from the source image"
    ],
    mood: "Warm, celebratory, and emotionally close",
    sceneSummary: "A shared celebratory moment between the visible people in the uploaded photo"
  };
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
