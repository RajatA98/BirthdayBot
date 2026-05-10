import { POST } from "@/app/api/generate/route";
import { DraftRequest, JobRecord, PlanRecord } from "@/lib/types";

describe("/api/generate", () => {
  const originalFalKey = process.env.FAL_KEY;

  afterEach(() => {
    process.env.FAL_KEY = originalFalKey;
  });

  it("returns a failed JobRecord (no server-side persistence) when FAL_KEY is unset", async () => {
    process.env.FAL_KEY = "";

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify(makePlanRecord())
      })
    );

    expect(response.status).toBe(200);

    const job = (await response.json()) as JobRecord;
    expect(job).toMatchObject({
      requestId: "req_inline_payload",
      stage: "failed",
      caption: "Happy birthday, legend.",
      error: "FAL_KEY is required to generate a personalized video."
    });
    expect(typeof job.jobId).toBe("string");
  });

  it("rejects requests that omit required plan fields with a 400", async () => {
    process.env.FAL_KEY = "";

    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({ requestId: "req_missing", caption: "" })
      })
    );

    expect(response.status).toBe(400);
  });
});

function makePlanRecord(): PlanRecord {
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
      surpriseFactor: "A tasteful birthday reveal.",
      subjectCount: 2,
      identityAnchors: ["Woman on left", "Man on right"],
      sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
      safePrompt: "Preserve exactly two people and animate them naturally.",
      negativePrompt: "No extra people."
    },
    caption: "Happy birthday, legend.",
    createdAt: Date.now()
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
