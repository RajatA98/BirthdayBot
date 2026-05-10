type LangfuseCall = { type: string; name?: string; metadata?: Record<string, unknown>; output?: unknown };

const langfuseCalls = vi.hoisted<{ value: LangfuseCall[] }>(() => ({ value: [] }));

type AnyArgs = Record<string, unknown>;

const fakeLangfuse = vi.hoisted(() => ({
  trace: vi.fn((args: AnyArgs) => {
    langfuseCalls.value.push({
      type: "trace",
      name: args?.name as string | undefined,
      metadata: args?.metadata as Record<string, unknown> | undefined
    });
    return {
      generation: vi.fn((genArgs: AnyArgs) => {
        langfuseCalls.value.push({
          type: "generation",
          name: genArgs?.name as string | undefined
        });
        return {
          end: vi.fn((endArgs: AnyArgs) => {
            langfuseCalls.value.push({
              type: "generation:end",
              output: endArgs?.output
            });
          })
        };
      }),
      event: vi.fn((evArgs: AnyArgs) => {
        langfuseCalls.value.push({
          type: "event",
          name: evArgs?.name as string | undefined,
          metadata: evArgs?.metadata as Record<string, unknown> | undefined
        });
      }),
      update: vi.fn((upArgs: AnyArgs) => {
        langfuseCalls.value.push({
          type: "trace:update",
          output: upArgs?.output,
          metadata: upArgs?.metadata as Record<string, unknown> | undefined
        });
      })
    };
  }),
  flushAsync: vi.fn(async () => undefined)
}));

vi.mock("@/lib/langfuse", () => ({
  getLangfuse: vi.fn(() => fakeLangfuse),
  traceTool: vi.fn(
    async (
      name: string,
      fn: () => Promise<unknown>,
      options?: {
        model?: string;
        metadata?: Record<string, unknown>;
        extractUsage?: (r: unknown) => unknown;
        extractOutput?: (r: unknown) => unknown;
      }
    ) => {
      const trace = fakeLangfuse.trace({ name, metadata: options?.metadata });
      const generation = trace?.generation?.({ name, model: options?.model });
      try {
        const result = await fn();
        const output = options?.extractOutput
          ? options.extractOutput(result)
          : result;
        const usage = options?.extractUsage?.(result);
        generation?.end?.({ output, usage });
        trace?.update?.({ output });
        await fakeLangfuse.flushAsync?.();
        return result;
      } catch (error) {
        generation?.end?.({ level: "ERROR", statusMessage: String(error) });
        await fakeLangfuse.flushAsync?.();
        throw error;
      }
    }
  ),
  emitTraceEvent: vi.fn((name: string, metadata?: Record<string, unknown>) => {
    const trace = fakeLangfuse.trace({ name });
    trace.event?.({ name, metadata });
  })
}));

const responsesCreate = vi.hoisted(() =>
  vi.fn(async (args: { input?: Array<{ role?: string }> }) => {
    // The first call is analyze-photo (no system in legacy positioning, but
    // we now pass system first), the second is plan-and-caption. Differ
    // shape by whether there's an input_image part.
    const userMessage = args.input?.find((m) => m.role === "user") as
      | { content?: Array<{ type?: string }> | string }
      | undefined;
    const isAnalyze =
      Array.isArray(userMessage?.content) &&
      userMessage.content.some((c) => c.type === "input_image");

    if (isAnalyze) {
      return {
        output_text: JSON.stringify({
          subjectCount: 2,
          identityAnchors: ["Person A", "Person B"],
          clothingAnchors: ["Casual"],
          compositionAnchors: ["Together"],
          mood: "Warm",
          sceneSummary: "Two people in a casual setting"
        }),
        usage: { input_tokens: 800, output_tokens: 100 }
      };
    }

    return {
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
          identityAnchors: ["Person A", "Person B"],
          sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
          safePrompt: "Safe prompt.",
          negativePrompt: "Negative prompt.",
          narrationVoiceCue: "warm American female, intimate"
        },
        caption: "Happy birthday."
      }),
      usage: { input_tokens: 1500, output_tokens: 250 }
    };
  })
);

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: responsesCreate }
  }))
}));

import { generatePlanAndCaption } from "@/lib/plan-service";
import { DraftRequest } from "@/lib/types";

describe("Langfuse pipeline instrumentation", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    langfuseCalls.value.length = 0;
    responsesCreate.mockClear();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("emits an analyze-photo trace + generation span with usage on the planning step", async () => {
    await generatePlanAndCaption(makeDraft());

    const analyzeTrace = langfuseCalls.value.find(
      (c) => c.type === "trace" && c.name === "analyze-photo"
    );
    expect(analyzeTrace).toBeDefined();

    const analyzeGeneration = langfuseCalls.value.find(
      (c) => c.type === "generation" && c.name === "analyze-photo"
    );
    expect(analyzeGeneration).toBeDefined();

    const analyzeEnd = langfuseCalls.value.find((c) => c.type === "generation:end");
    expect(analyzeEnd).toBeDefined();
  });

  it("emits a plan-and-caption trace + generation span on the planning step", async () => {
    await generatePlanAndCaption(makeDraft());

    const planTrace = langfuseCalls.value.find(
      (c) => c.type === "trace" && c.name === "plan-and-caption"
    );
    expect(planTrace).toBeDefined();

    const planGeneration = langfuseCalls.value.find(
      (c) => c.type === "generation" && c.name === "plan-and-caption"
    );
    expect(planGeneration).toBeDefined();
  });

  it("flushes the Langfuse client after the planning step", async () => {
    await generatePlanAndCaption(makeDraft());

    expect(fakeLangfuse.flushAsync).toHaveBeenCalled();
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
