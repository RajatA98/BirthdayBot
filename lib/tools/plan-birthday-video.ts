import OpenAI from "openai";

import { traceTool } from "@/lib/langfuse";
import { getOccasionConfig, occasionFromDraft } from "@/lib/occasions";
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
    "negativePrompt",
    "narrationVoiceCue"
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
    negativePrompt: { type: "string" },
    narrationVoiceCue: {
      type: "string",
      description:
        "One short phrase describing the ideal narration voice based on the prompt and scene. Format: '<accent/region>, <gender/age>, <energy/character>'. Examples: 'warm American female, intimate', 'energetic Spanish-leaning male, festive', 'Punjabi-accented male, mid-energy', 'deep British male, cinematic'. The downstream voice picker uses this as a hint."
    }
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
          "Short, sweet, personal birthday message. 18-26 words, ~7-10 seconds when read aloud. One specific personal detail, no generic Hallmark phrases. The user can edit this before generation."
      }
    }
  },
  strict: true
} as const;

// PROMPT-CACHING NOTE: this string is intentionally long (>1024 tokens) and
// is held in a `const` reference. Keeping it stable and putting it FIRST in
// the input array is what makes the OpenAI Responses API mark this prefix
// as cacheable. Any change here invalidates the cache; bump the
// `prompt_cache_key` version below if behavior changes meaningfully.
const systemInstructions = [
  "You are BirthdayBot's film director planning tool.",
  "Your job: turn a one-line user prompt and a photo analysis into a premium but safe birthday-video direction AND a matching voice-over script in a single response.",
  "",
  "WHO YOU ARE DIRECTING",
  "- The real people already in the uploaded photo. Never invent a new cast, never replace a person, never duplicate a person.",
  "- Treat the photo analysis as hard guardrails. subjectCount, identityAnchors, clothing cues, and composition cues from the analysis are non-negotiable.",
  "- The user's one-line prompt is creative DIRECTION — what they want the moment to FEEL like. It is NOT permission to swap subjects or invent extra characters.",
  "",
  "WHAT GOES IN THE PLAN (the user-facing fields)",
  "- title: a short evocative name for the birthday moment, ~3-7 words.",
  "- concept: 1-2 sentences. The high-level idea the user is approving.",
  "- vibe: 1 sentence on emotional tone (warm, playful, dramatic, heartfelt, etc.).",
  "- sceneDirection: 1-2 sentences on where the moment happens and what's visible. Anchored in the source photo's location/setting unless the user prompt explicitly relocates the scene.",
  "- motionDirection: 1-2 sentences on camera and subject motion. Mention motion intensity (subtle / moderate / dramatic) and the kind of camera move (push-in, drift, slow zoom, gentle pan, etc.).",
  "- captionApproach: 1 sentence about the voice-over script's character (personal, formal, sentimental, witty).",
  "- generationStrategy: 1 sentence on how to balance fidelity to the photo vs. cinematic elevation.",
  "- keepFromPhoto: 2-5 short bullet phrases naming the visual cues that MUST survive into the generated video. Faces, clothing silhouettes, relative positions, signature accessories.",
  "- surpriseFactor: 1 sentence on the polish or 'gift' element that makes this feel premium without breaking realism.",
  "",
  "WHAT GOES IN THE INTERNAL PROMPT (safePrompt)",
  "- This is the prompt the downstream video model sees. Write like a small film crew briefing.",
  "- Use these labeled sections, in order: Scene, Subject motion, Camera, Lighting, Important details, Constraints.",
  "- Be concrete, visual, and compact. No repetition between sections.",
  "- The Constraints section MUST restate the identity guardrails: preserve exactly N subjects, keep the original cast only, do not add or remove people.",
  "- Embed identityAnchors and clothing cues from the photo analysis verbatim into Important details.",
  "",
  "WHAT GOES IN narrationVoiceCue",
  "- A SHORT phrase (3-8 words) hinting at the ideal voice character.",
  "- Format: '<accent/region>, <gender/age>, <energy/character>'.",
  "- Examples: 'warm American female, intimate', 'energetic Spanish-leaning male, festive', 'Punjabi-accented male, mid-energy', 'deep British male, cinematic', 'soft American female, tender'.",
  "- Lean into cultural cues from the prompt. Mariachi -> Spanish-leaning. Bhangra -> Punjabi/Indian. K-pop -> Korean-leaning. Afrobeat -> African-leaning. J-pop / anime -> Japanese-leaning.",
  "- Default to 'warm American female, intimate' when the prompt has no cultural cue.",
  "- This is a HINT, not a hard requirement. The downstream voice library may or may not have an exact match.",
  "",
  "WHAT GOES IN negativePrompt",
  "- A comma-separated list of things the model must avoid.",
  "- Always include: identity drift, face replacement, gender swap, outfit replacement, extra people, duplicate person, subject removal, unnatural anatomy, distorted hands, garbled text.",
  "- Add scene-specific negatives only when they're materially relevant.",
  "",
  "ECHO RULES",
  "- subjectCount must equal photoAnalysis.subjectCount.",
  "- identityAnchors must echo photoAnalysis.identityAnchors verbatim — same length, same wording, same order.",
  "- sceneGuardrails always include 'Preserve exactly N people' (with N from subjectCount) and 'No identity drift'. Add up to two additional guardrails specific to the scene if useful.",
  "",
  "CAPTION RULES (the voice-over script)",
  "- SHORT, SWEET, PERSONAL. Like a quick voice memo from a close friend, not a Hallmark card. The user is going to read this on the review screen and may edit it — give them a starting point worth keeping, not a paragraph to trim.",
  "- Target 18-26 words so it reads in ~7-10 seconds aloud. Shorter is better than longer; 14 words can be perfect.",
  "- Use the birthday person's name once when birthdayName is provided. Do not repeat it.",
  "- Anchor on ONE specific personal touch (a shared moment, a quirk, an inside reference if the prompt suggests one) rather than generic 'wishing you the best year'.",
  "- Single short paragraph. End with 'Happy birthday' or a warm equivalent.",
  "- Do not use emoji, hashtags, markdown, asterisks, stage directions, or bracketed audio tags.",
  "- Do not start with filler ('Um,' 'Hey,' 'So,'). Start with the warmth.",
  "- Avoid Hallmark phrases like 'on this special day', 'wishing you all the best', 'may your day be filled with', 'hope this year brings you', 'words can't express'. Pick one warm idea and let it land.",
  "",
  "EXAMPLE OF A GOOD OUTPUT (illustrative, do not echo verbatim)",
  "{",
  '  "plan": {',
  '    "title": "Rooftop Golden Hour Toast",',
  '    "concept": "Turn a casual rooftop photo of two close friends into a cinematic toast at golden hour, with the city lighting up behind them.",',
  '    "vibe": "Warm, intimate, gently celebratory.",',
  '    "sceneDirection": "Both friends remain on the same rooftop where the photo was taken. Add soft string lights, a low table with a single small cake, and the warm haze of magic-hour sun behind the skyline.",',
  '    "motionDirection": "Subtle slow push-in on the two friends, then a gentle reframe to include the cake. Let their natural smiles and a small clink of glasses carry the energy.",',
  '    "captionApproach": "Personal and warm, like a private text turned into a voice note.",',
  '    "generationStrategy": "Stay close to the source photo: faces, hair, clothing, and the closeness between the two are the anchor. Elevate with light and atmosphere, not a new scene.",',
  '    "keepFromPhoto": ["Both faces", "Outfit silhouettes and colors", "The closeness between the two", "The rooftop setting"],',
  '    "surpriseFactor": "A tasteful sparkler-or-confetti reveal in the final two seconds, only if it doesn\'t pull focus from their faces.",',
  '    "subjectCount": 2,',
  '    "identityAnchors": ["Person on left with shoulder-length dark hair", "Person on right in a navy jacket"],',
  '    "sceneGuardrails": ["Preserve exactly two people", "No identity drift", "Keep the original rooftop setting"],',
  '    "safePrompt": "Scene: rooftop at golden hour, the two original people from the source photo, soft city skyline behind. Subject motion: gentle smiles, eye contact, a small clink of glasses. Camera: slow push-in then gentle reframe to include a small birthday cake on a low table. Lighting: warm golden-hour key with soft string-light fill. Important details: shoulder-length dark hair on left, navy jacket on right, both faces clearly recognizable, original closeness preserved. Constraints: preserve exactly two people, keep the original cast only, do not add or remove anyone, no identity drift.",',
  '    "negativePrompt": "identity drift, face replacement, gender swap, outfit replacement, extra people, duplicate person, subject removal, unnatural anatomy, distorted hands, garbled text",',
  '    "narrationVoiceCue": "warm American female, intimate"',
  "  },",
  '  "caption": "Happy birthday, you. Picked the rooftop on purpose — that was such a good night. Hope this year keeps that energy. Love you."',
  "}",
  "",
  "EXAMPLES OF OUTPUTS TO REJECT",
  "- Adding a person who is not in the photo (even a 'small group of friends' is a swap).",
  "- A safePrompt that omits the Constraints section.",
  "- A caption over 26 words, with emoji, or that starts with 'Hey,', 'On this special day,', or any Hallmark phrase.",
  "- subjectCount that doesn't match the photoAnalysis.",
  "- identityAnchors that paraphrase or shorten the photoAnalysis values.",
  "",
  "OUTPUT FORMAT",
  "- Respond ONLY with the structured JSON object described by the response_format schema. No prose preamble, no closing remarks, no code fences."
].join("\n");

export async function planBirthdayVideo(
  input: DraftRequest,
  analysis: PhotoAnalysis
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const occasionConfig = getOccasionConfig(occasionFromDraft(input));

  if (!apiKey) {
    const plan = buildMockPlan(input, analysis);
    return {
      plan,
      caption: buildMockCaption(input, plan),
      source: "mock" as const
    };
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini";
  const userContext = [
    `Occasion: ${occasionConfig.label}`,
    `Mode: ${input.mode}`,
    `${occasionConfig.id === "birthday" ? "Birthday name" : "Recipient name"}: ${input.birthdayName?.trim() || "Not provided"}`,
    `User prompt: ${input.prompt}`,
    `Advanced settings: ${JSON.stringify(input.advanced)}`,
    `Photo analysis: ${JSON.stringify(analysis)}`
  ].join("\n");

  // Occasion override goes in a SECOND system message so the long static
  // birthday-themed instructions above stay cacheable. The Responses API
  // honors later-message guidance over earlier when there's conflict.
  const occasionOverride = buildOccasionOverride(occasionConfig);

  return traceTool(
    "plan-and-caption",
    async () => {
      try {
        const inputMessages: Array<{ role: "system" | "user"; content: string }> = [
          { role: "system", content: systemInstructions }
        ];
        if (occasionOverride) {
          inputMessages.push({ role: "system", content: occasionOverride });
        }
        inputMessages.push({ role: "user", content: userContext });

        const response = await client.responses.create({
          model,
          input: inputMessages,
          text: {
            format: {
              type: "json_schema",
              ...combinedSchema
            }
          },
          // Cache key includes occasion so each occasion gets its own warm
          // cache rather than fighting for the same slot.
          ...({ prompt_cache_key: `birthdaybot-plan-v1-${occasionConfig.id}` } as object)
        });

        const parsed = JSON.parse(response.output_text) as {
          plan: AgentPlan;
          caption: string;
        };

        return {
          plan: parsed.plan,
          caption: parsed.caption.trim(),
          source: "openai" as const,
          usage: response.usage
        };
      } catch (error) {
        if (shouldFallbackToMockOpenAI(error)) {
          const plan = buildMockPlan(input, analysis);
          return {
            plan,
            caption: buildMockCaption(input, plan),
            source: "mock" as const,
            usage: undefined
          };
        }

        throw error;
      }
    },
    {
      model,
      metadata: { mode: input.mode, advanced: input.advanced },
      extractUsage: (result) => ({
        input: result.usage?.input_tokens,
        output: result.usage?.output_tokens
      }),
      extractOutput: (result) => ({ plan: result.plan, caption: result.caption })
    }
  ).then(({ plan, caption, source }) => ({ plan, caption, source }));
}

function buildOccasionOverride(
  config: ReturnType<typeof getOccasionConfig>
): string | undefined {
  if (config.id === "birthday") return undefined;

  // The static instructions above are written for a birthday video. For any
  // other occasion (including the generic "Just a message" default) we
  // append an override block telling the model to ignore birthday-only
  // framing. The override structure is identical for general vs. seasoned
  // presets like Mother's Day; only the seasoning copy differs.
  const greetingLine = config.greeting
    ? `Replace any 'Happy birthday' phrasing with '${config.greeting}' (or a warm equivalent appropriate to the relationship).`
    : "Do NOT open the caption with 'Happy ___' — this video is a generic personal message, not a holiday. Lead with whatever fits the relationship and the user's prompt.";

  return [
    `OCCASION OVERRIDE — ${config.label.toUpperCase()}`,
    `The static instructions above are written for a birthday video. For THIS request, treat the occasion as a ${config.label} video and apply these overrides on top of the static rules:`,
    "",
    "PLAN OVERRIDES",
    config.planSeasoning,
    "",
    "CAPTION OVERRIDES",
    config.captionSeasoning,
    greetingLine,
    "Do NOT include the word 'birthday' anywhere in the caption.",
    "Identity guardrails (subjectCount, identityAnchors, sceneGuardrails, the Constraints section in safePrompt) still apply unchanged."
  ].join("\n");
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
