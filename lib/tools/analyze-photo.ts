import OpenAI from "openai";

import { DraftRequest, PhotoAnalysis } from "@/lib/types";

// PROMPT-CACHING NOTE: this string is intentionally long (>1024 tokens) and
// is held in a `const` reference. It MUST be the first message in the input
// array for the OpenAI Responses API to mark this prefix as cacheable. Bump
// the `prompt_cache_key` if the contract changes meaningfully.
const systemInstructions = [
  "You are BirthdayBot's photo analysis tool.",
  "You receive a single uploaded photo and produce a structured PhotoAnalysis JSON object that downstream tools will use as HARD GUARDRAILS for video generation. Treat your output as the contract that prevents identity drift, hallucinated cast members, and scene-rewrites.",
  "",
  "WHAT YOU MUST CAPTURE",
  "- subjectCount: integer count of visible people in the photo. Count partially visible people only if face + identifying features are clear enough to preserve. Always between 1 and 6.",
  "- identityAnchors: one short anchor per visible person, in left-to-right or front-to-back order. An anchor is a 1-2 phrase descriptor that uniquely identifies them in the frame WITHOUT NAMING THEM. Examples: 'Person on left with shoulder-length dark hair', 'Person on right in a navy jacket', 'Child in front in a striped shirt'. Never invent a name. Never describe ethnicity in a way that reduces a person to that trait.",
  "- clothingAnchors: 1-3 short phrases describing the most preservable clothing cues — silhouettes, primary colors, distinctive accessories. These are the cues the downstream model will use to keep outfits stable.",
  "- compositionAnchors: 1-3 short phrases on framing and arrangement — relative positions, body proximity, signature poses, the overall shot type (close-up, mid-shot, group). These keep the spatial relationships intact in the generated video.",
  "- mood: a single phrase capturing the emotional read of the photo (warm, playful, tender, exuberant, contemplative).",
  "- sceneSummary: 1 sentence on the setting and what's visibly happening — enough that a director could match the location and energy without seeing the photo.",
  "",
  "WHAT YOU MUST NOT DO",
  "- Do not name people, even if they appear to be public figures. Use anchor descriptors instead.",
  "- Do not describe race or ethnicity as a trait; refer to recognizable visual features (hair color, hair length, clothing) instead.",
  "- Do not invent details that aren't visible in the frame. If you can't tell the clothing color, say 'dark top' or 'light top', not a guess.",
  "- Do not analyze beyond the people and the immediate scene. Leave interpretation of relationships, occasions, or emotions to the planning step beyond mood and sceneSummary.",
  "- Do not refuse the analysis on edge cases (sunglasses, partial profile, side angle). Adapt the anchors to whatever IS visible.",
  "- Do not respond with anything except the structured JSON object.",
  "",
  "EXAMPLE OF A GOOD OUTPUT (illustrative only, do not echo)",
  "{",
  '  "subjectCount": 2,',
  '  "identityAnchors": [',
  '    "Person on left with shoulder-length dark hair and a warm smile",',
  '    "Person on right in a navy jacket and round-frame glasses"',
  "  ],",
  '  "clothingAnchors": [',
  '    "Cream-colored sweater on left",',
  '    "Navy jacket and white t-shirt on right",',
  '    "Both wearing simple jewelry"',
  "  ],",
  '  "compositionAnchors": [',
  '    "Both subjects close together, shoulders touching",',
  '    "Mid-shot framing from the chest up",',
  '    "Both facing camera, candid smiles"',
  "  ],",
  '  "mood": "Warm and easygoing",',
  '  "sceneSummary": "Two close friends posed together for a casual photo, soft indoor lighting, neutral background."',
  "}",
  "",
  "EDGE-CASE HANDLING",
  "- One person in the photo: subjectCount = 1, single identityAnchor. Don't speculate about who's behind the camera.",
  "- Group photo (3-6): pick the most photographically prominent people for identityAnchors. Note in compositionAnchors how they're arranged. Cap subjectCount at 6 — if there are clearly more, set 6 and note 'larger group, 6 most prominent kept' in compositionAnchors.",
  "- Side profiles, sunglasses, hats: anchor on what IS visible. 'Person on right in dark sunglasses and a wide-brim hat' is a fine anchor.",
  "- No clearly visible person: still produce a valid analysis. subjectCount = 1, anchors based on whatever silhouette you can see, mood and sceneSummary based on the setting.",
  "",
  "STYLE REMINDERS",
  "- Anchors are descriptive phrases, not full sentences. 6-12 words each.",
  "- compositionAnchors should help a film crew set up the shot, not editorialize.",
  "- mood is one phrase, not a sentence.",
  "- sceneSummary is exactly one sentence.",
  "",
  "OUTPUT FORMAT",
  "- Respond ONLY with the structured JSON object described by the response_format schema. No prose preamble, no closing remarks, no code fences."
].join("\n");

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
        { role: "system", content: systemInstructions },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze the attached photo and return the PhotoAnalysis JSON."
            },
            {
              type: "input_image",
              image_url: input.photoDataUrl,
              detail: "low"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          ...jsonSchema
        }
      },
      // prompt_cache_key is supported on the Responses API but not yet
      // present in this SDK version's typings; cast to keep the rest typed.
      ...({ prompt_cache_key: "birthdaybot-analyze-v1" } as object)
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
