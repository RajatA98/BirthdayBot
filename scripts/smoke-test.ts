import { generatePlanAndCaption } from "../lib/plan-service";
import { resolveJobStatus, startVideoGeneration } from "../lib/video-service";
import { DraftRequest, JobRecord, PlanRecord } from "../lib/types";

async function main() {
  const photoDataUrl = await imageUrlToDataUrl(
    "https://raw.githubusercontent.com/github/explore/main/topics/react/react.png"
  );

  const draft: DraftRequest = {
    mode: "simple",
    prompt:
      "remove screams in background of audio. audio should be the narration, and some party background music at low volume.",
    photoName: "smoke-test.png",
    photoDataUrl,
    advanced: {
      tone: "Heartfelt",
      sceneIdea: "Rooftop city glow",
      videoLength: "5 seconds",
      aspectRatio: "Portrait",
      captionStyle: "Subtle",
      musicVibe: "Emotional",
      motionIntensity: "Subtle",
      agentGoalMode: "Stay close to prompt"
    }
  };

  console.log("1. Generating plan and caption...");
  const planned = await generatePlanAndCaption(draft);
  console.log(
    JSON.stringify(
      {
        source: planned.source,
        planTitle: planned.plan.title,
        captionPreview: planned.caption.slice(0, 120)
      },
      null,
      2
    )
  );

  const planRecord: PlanRecord = {
    requestId: "smoke_req",
    draft,
    plan: planned.plan,
    caption: planned.caption,
    createdAt: Date.now()
  };
  const job: JobRecord = {
    jobId: "smoke_job",
    requestId: planRecord.requestId,
    stage: "queued",
    statusMessage: "Queued and preparing the creative brief.",
    attempts: 1,
    caption: planRecord.caption,
    createdAt: Date.now()
  };

  console.log("2. Starting video generation...");
  const providerJob = await startVideoGeneration(planRecord, job);
  console.log(
    JSON.stringify(
      {
        providerRequestId: providerJob.providerRequestId ?? null,
        providerEndpoint: providerJob.providerEndpoint ?? null
      },
      null,
      2
    )
  );

  console.log("3. Resolving current job status...");
  const status = await resolveJobStatus(providerJob);
  console.log(JSON.stringify(status, null, 2));
}

main().catch((error) => {
  console.error("Smoke test failed:");
  console.error(error);
  process.exit(1);
});

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch smoke test image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}
