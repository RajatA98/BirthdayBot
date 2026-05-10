type ResponsesCreateArgs = Record<string, unknown>;

const responsesCreate = vi.hoisted(() =>
  vi.fn(async (_args: ResponsesCreateArgs) => ({
    output_text: JSON.stringify({
      subjectCount: 2,
      identityAnchors: ["Person on left", "Person on right"],
      clothingAnchors: ["Casual clothing"],
      compositionAnchors: ["Standing close"],
      mood: "Warm",
      sceneSummary: "Two people in a casual setting"
    }),
    usage: { input_tokens: 800, output_tokens: 120 }
  }))
);

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: responsesCreate }
  }))
}));

import {
  __resetPhotoAnalysisCacheForTests,
  analyzePhoto
} from "@/lib/tools/analyze-photo";
import { DraftRequest } from "@/lib/types";

describe("analyzePhoto prompt caching", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    responsesCreate.mockClear();
    __resetPhotoAnalysisCacheForTests();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("passes prompt_cache_key on the photo-analysis call", async () => {
    await analyzePhoto(makeDraft());

    expect(responsesCreate).toHaveBeenCalledTimes(1);
    const call = responsesCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.prompt_cache_key).toBe("birthdaybot-analyze-v1");
  });

  it("sends a system message large enough to qualify for OpenAI prompt caching", async () => {
    await analyzePhoto(makeDraft());

    const call = responsesCreate.mock.calls[0]?.[0] as {
      input?: Array<{
        role: string;
        content: Array<{ type: string; text?: string }> | string;
      }>;
    };
    const systemMessage = call.input?.find((entry) => entry.role === "system");
    expect(systemMessage).toBeDefined();

    const text =
      typeof systemMessage?.content === "string"
        ? systemMessage.content
        : (systemMessage?.content || [])
            .map((part) => (part.type === "input_text" ? part.text || "" : ""))
            .join("");
    const approxTokens = text.length / 4;
    expect(approxTokens).toBeGreaterThan(1024);
  });

  it("places the system message before the user message that carries the photo", async () => {
    await analyzePhoto(makeDraft());

    const call = responsesCreate.mock.calls[0]?.[0] as {
      input?: Array<{ role: string }>;
    };
    expect(call.input?.[0]?.role).toBe("system");
    expect(call.input?.[1]?.role).toBe("user");
  });

  it("collapses two calls with the same photo into one OpenAI request", async () => {
    const draft = makeDraft();
    const [a, b] = await Promise.all([analyzePhoto(draft), analyzePhoto(draft)]);

    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});

function makeDraft(): DraftRequest {
  return {
    mode: "simple",
    prompt: "Make it cinematic.",
    photoName: "test.png",
    photoDataUrl: "data:image/png;base64,ZmFrZQ==",
    advanced: {
      tone: "Heartfelt",
      sceneIdea: "Birthday dinner",
      videoLength: "15 seconds",
      aspectRatio: "Portrait",
      captionStyle: "Subtle",
      musicVibe: "Uplifting",
      motionIntensity: "Moderate",
      agentGoalMode: "Surprise me"
    }
  };
}
