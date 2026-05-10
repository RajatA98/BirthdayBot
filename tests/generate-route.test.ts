import { POST } from "@/app/api/generate/route";
import { getJob } from "@/lib/memory-store";
import { DraftRequest, GenerateRequest } from "@/lib/types";

describe("/api/generate", () => {
  const originalFalKey = process.env.FAL_KEY;

  afterEach(() => {
    process.env.FAL_KEY = originalFalKey;
  });

  it("starts from the submitted plan payload when the in-memory plan is missing", async () => {
    process.env.FAL_KEY = "";
    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify(makeGenerateRequest())
      })
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as { jobId: string };
    const job = getJob(body.jobId);

    expect(job).toMatchObject({
      requestId: "req_inline_payload",
      stage: "failed",
      caption: "Happy birthday, legend.",
      error: "FAL_KEY is required to generate a personalized video."
    });
  });
});

function makeGenerateRequest(): GenerateRequest {
  return {
    requestId: "req_inline_payload",
    draft: makeDraft(),
    plan: {
      title: "Birthday reveal",
      concept: "A cinematic birthday toast built from the uploaded photo.",
      vibe: "Warm and celebratory.",
      sceneDirection: "Use rooftop lights and a festive table.",
      motionDirection: "Slow push-in with gentle sparkle.",
      captionApproach: "Short and heartfelt.",
      generationStrategy:
        "Stay close to the photo while adding celebration details.",
      keepFromPhoto: ["Faces", "Clothing"],
      surpriseFactor: "A tasteful birthday reveal."
    },
    caption: "Happy birthday, legend."
  };
}

function makeDraft(): DraftRequest {
  return {
    mode: "simple",
    prompt: "Make it a rooftop toast at sunset.",
    photoName: "birthday.png",
    photoDataUrl: "data:image/png;base64,ZmFrZQ==",
    advanced: {
      tone: "Heartfelt",
      sceneIdea: "Birthday dinner",
      videoLength: "10 seconds",
      aspectRatio: "Portrait",
      captionStyle: "Subtle",
      musicVibe: "Uplifting",
      motionIntensity: "Moderate",
      agentGoalMode: "Surprise me"
    }
  };
}
