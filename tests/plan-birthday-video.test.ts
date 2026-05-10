type ResponsesCreateArgs = Record<string, unknown>;

const responsesCreate = vi.hoisted(() =>
  vi.fn(async (_args: ResponsesCreateArgs) => ({
    output_text: JSON.stringify({
      plan: {
        title: "Test plan",
        concept: "Test concept",
        vibe: "Warm.",
        sceneDirection: "Scene direction.",
        motionDirection: "Motion direction.",
        captionApproach: "Caption approach.",
        generationStrategy: "Generation strategy.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Surprise factor.",
        subjectCount: 2,
        identityAnchors: ["Person 1", "Person 2"],
        sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
        safePrompt: "Safe prompt.",
        negativePrompt: "Negative prompt."
      },
      caption: "Happy birthday."
    }),
    usage: { input_tokens: 1500, output_tokens: 250 }
  }))
);

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: responsesCreate }
  }))
}));

import { planBirthdayVideo } from "@/lib/tools/plan-birthday-video";
import { DraftRequest, PhotoAnalysis } from "@/lib/types";

describe("planBirthdayVideo prompt caching", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    responsesCreate.mockClear();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("passes prompt_cache_key on the plan-and-caption call", async () => {
    await planBirthdayVideo(makeDraft(), makeAnalysis());

    expect(responsesCreate).toHaveBeenCalledTimes(1);
    const call = responsesCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.prompt_cache_key).toBe("birthdaybot-plan-v1");
  });

  it("sends a system message large enough to qualify for OpenAI prompt caching", async () => {
    await planBirthdayVideo(makeDraft(), makeAnalysis());

    const call = responsesCreate.mock.calls[0]?.[0] as {
      input?: Array<{ role: string; content: string }>;
    };
    const systemMessage = call.input?.find((entry) => entry.role === "system");
    expect(systemMessage).toBeDefined();

    // OpenAI prompt caching kicks in at >= 1024 tokens. char/4 is the
    // standard rough estimate; we want a comfortable margin.
    const approxTokens = (systemMessage?.content.length || 0) / 4;
    expect(approxTokens).toBeGreaterThan(1024);
  });

  it("places the static system message before the variable user message", async () => {
    await planBirthdayVideo(makeDraft(), makeAnalysis());

    const call = responsesCreate.mock.calls[0]?.[0] as {
      input?: Array<{ role: string }>;
    };
    expect(call.input?.[0]?.role).toBe("system");
    expect(call.input?.[1]?.role).toBe("user");
  });
});

function makeDraft(): DraftRequest {
  return {
    mode: "simple",
    prompt: "Make it cinematic.",
    birthdayName: "Maya",
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

function makeAnalysis(): PhotoAnalysis {
  return {
    subjectCount: 2,
    identityAnchors: ["Person on left", "Person on right"],
    clothingAnchors: ["Casual clothing"],
    compositionAnchors: ["Standing close together"],
    mood: "Warm",
    sceneSummary: "Two people in a casual setting"
  };
}
