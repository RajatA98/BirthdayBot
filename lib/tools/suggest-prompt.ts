import OpenAI from "openai";

import { traceTool } from "@/lib/langfuse";
import { analyzePhoto } from "@/lib/tools/analyze-photo";
import { DraftRequest } from "@/lib/types";

const systemInstructions = [
  "You are BirthdayBot's prompt-suggestion helper.",
  "Given a structured photo analysis, draft ONE short first-person sentence (max 28 words) the user could send as the prompt for their personalized AI birthday video.",
  "The sentence should:",
  "- Reflect what's visibly in the photo (subjects, mood, setting) without naming anyone.",
  "- Read naturally, like the user wrote it themselves: warm, specific, casual.",
  "- Suggest one concrete celebration beat (a toast, a hug, balloons drifting, candles lit, confetti, etc.) so the video has something to render.",
  "- Avoid camera direction, model jargon, or 'cinematic' marketing-speak.",
  "Return ONLY the sentence, no quotes, no preamble."
].join("\n");

export async function suggestPromptFromPhoto(
  draft: DraftRequest
): Promise<string> {
  const analysis = await analyzePhoto(draft);
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = buildFallbackSuggestion(
    analysis.sceneSummary,
    analysis.mood,
    draft.birthdayName
  );

  if (!apiKey) {
    return fallback;
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini";

  return traceTool(
    "suggest-prompt",
    async () => {
      try {
        const response = await client.responses.create({
          model,
          input: [
            { role: "system", content: systemInstructions },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    "Photo analysis JSON:",
                    JSON.stringify(
                      {
                        subjectCount: analysis.subjectCount,
                        mood: analysis.mood,
                        sceneSummary: analysis.sceneSummary,
                        identityAnchors: analysis.identityAnchors,
                        compositionAnchors: analysis.compositionAnchors
                      },
                      null,
                      2
                    ),
                    draft.birthdayName
                      ? `Birthday recipient: ${draft.birthdayName}.`
                      : "",
                    "Draft the suggestion sentence."
                  ]
                    .filter(Boolean)
                    .join("\n")
                }
              ]
            }
          ],
          ...({ prompt_cache_key: "birthdaybot-suggest-v1" } as object)
        });

        const text = response.output_text?.trim();
        return text && text.length > 0 ? text : fallback;
      } catch {
        return fallback;
      }
    },
    {
      model,
      metadata: { subjectCount: analysis.subjectCount },
      extractOutput: (result) => result
    }
  );
}

function buildFallbackSuggestion(
  sceneSummary: string,
  mood: string,
  birthdayName?: string
): string {
  const who = birthdayName?.trim() || "my favorite person";
  const moodPhrase = mood?.trim() ? mood.trim().toLowerCase() : "warm";
  const scene = sceneSummary?.trim()
    ? sceneSummary.trim().replace(/\.$/, "")
    : "a celebratory moment together";
  return `Make a ${moodPhrase} birthday video for ${who} that captures ${scene}, with a small celebration beat like balloons or candles.`;
}
