import { defaultAdvancedSettings } from "@/lib/defaults";

describe("openai quota fallback", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    vi.resetModules();
    vi.doUnmock("openai");
  });

  it("falls back to mock photo analysis when OpenAI quota is exceeded", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          create: vi.fn().mockRejectedValue(
            Object.assign(
              new Error(
                "429 You exceeded your current quota, please check your plan and billing details."
              ),
              { status: 429 }
            )
          )
        };
      }
    }));

    const { analyzePhoto } = await import("@/lib/tools/analyze-photo");
    const analysis = await analyzePhoto(makeDraft());

    expect(analysis.subjectCount).toBeGreaterThan(0);
    expect(analysis.identityAnchors.length).toBeGreaterThan(0);
  });

  it("falls back to a mock plan when OpenAI quota is exceeded", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          create: vi.fn().mockRejectedValue(
            Object.assign(
              new Error(
                "429 You exceeded your current quota, please check your plan and billing details."
              ),
              { status: 429 }
            )
          )
        };
      }
    }));

    const { planBirthdayVideo } = await import("@/lib/tools/plan-birthday-video");
    const planned = await planBirthdayVideo(makeDraft(), {
      subjectCount: 2,
      identityAnchors: ["Person 1", "Person 2"],
      clothingAnchors: ["Outfit 1", "Outfit 2"],
      compositionAnchors: ["Left-right composition"],
      mood: "Warm",
      sceneSummary: "Two people in frame"
    });

    expect(planned.source).toBe("mock");
    expect(planned.plan.safePrompt).toContain("Direct this like a premium birthday short film");
    expect(planned.caption.length).toBeGreaterThan(0);
  });
});

function makeDraft() {
  return {
    mode: "simple" as const,
    occasion: "birthday" as const,
    prompt: "make this a warm birthday celebration",
    photoName: "test.png",
    photoDataUrl: "data:image/png;base64,abc",
    advanced: defaultAdvancedSettings
  };
}
