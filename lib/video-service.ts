import { fal } from "@fal-ai/client";

import { DraftRequest, JobRecord, JobStage, PlanRecord } from "@/lib/types";

const stageSequence: JobStage[] = [
  "queued",
  "analyzing",
  "writing",
  "generating",
  "finalizing",
  "completed"
];

const stageMessages: Record<JobStage, string> = {
  queued: "Queued and preparing the creative brief.",
  analyzing: "Analyzing the photo and preserving identity cues.",
  writing: "Writing the generation prompt and birthday caption tone.",
  generating: "Generating the cinematic birthday video.",
  retrying: "Retrying with a safer, cleaner generation strategy.",
  finalizing: "Finalizing the output package.",
  completed: "Birthday package ready.",
  failed: "Generation stalled before a final video was ready."
};

const stageWindowMs = 1300;
const providerTimeoutMs = 6 * 60 * 1000;

export async function startVideoGeneration(planRecord: PlanRecord, job: JobRecord) {
  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return job;
  }

  fal.config({
    credentials: apiKey
  });

  const endpoint = process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video";
  const uploadedUrl = planRecord.draft.photoDataUrl.startsWith("http")
    ? planRecord.draft.photoDataUrl
    : await fal.storage.upload(
        dataUrlToBlob(planRecord.draft.photoDataUrl, planRecord.draft.photoName)
      );
  const prompt = buildFalPrompt(planRecord.draft, planRecord.plan);
  const result = await fal.queue.submit(endpoint, {
    input: {
      image_url: uploadedUrl,
      prompt
    }
  });

  return {
    ...job,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint
  };
}

export async function resolveJobStatus(job: JobRecord) {
  const apiKey = process.env.FAL_KEY;

  if (apiKey && job.providerRequestId && job.providerEndpoint) {
    if (Date.now() - job.createdAt > providerTimeoutMs) {
      return {
        stage: "failed" as const,
        statusMessage: "Generation took too long and timed out.",
        error: "Provider generation timed out."
      };
    }

    fal.config({
      credentials: apiKey
    });

    const status = await fal.queue.status(job.providerEndpoint, {
      requestId: job.providerRequestId,
      logs: true
    });

    const state = status.status;

    if (state === "COMPLETED") {
      const result = await fal.queue.result(job.providerEndpoint, {
        requestId: job.providerRequestId
      });
      const videoUrl = extractVideoUrl(result.data);

      if (!videoUrl) {
        return {
          stage: "failed" as const,
          statusMessage: "The provider completed without a usable video URL.",
          error: "Missing video URL from provider response."
        };
      }

      return {
        stage: "completed" as const,
        statusMessage: stageMessages.completed,
        videoUrl
      };
    }

    if (state === "IN_PROGRESS") {
      const providerStage = inferProviderStage(status.logs);
      return {
        stage: providerStage,
        statusMessage:
          status.logs?.at(-1)?.message || stageMessages[providerStage]
      };
    }

    if (state === "IN_QUEUE") {
      return {
        stage: "queued" as const,
        statusMessage: stageMessages.queued
      };
    }

    return {
      stage: "failed" as const,
      statusMessage: "The provider returned an unexpected generation state.",
      error: `Unexpected provider state: ${state}`
    };
  }

  const elapsed = Date.now() - job.createdAt;
  if (job.stage === "retrying" && elapsed < stageWindowMs) {
    return {
      stage: "retrying" as const,
      statusMessage: stageMessages.retrying
    };
  }
  const index = Math.min(
    Math.floor(elapsed / stageWindowMs),
    stageSequence.length - 1
  );
  const stage = stageSequence[index];

  return {
    stage,
    statusMessage: stageMessages[stage],
    videoUrl:
      stage === "completed"
        ? "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
        : undefined
  };
}

function inferProviderStage(logs?: Array<{ message?: string }>) {
  const joined = logs
    ?.map((entry) => entry.message?.toLowerCase() || "")
    .join(" ");

  if (!joined) {
    return "generating" as const;
  }

  if (joined.includes("analy")) {
    return "analyzing" as const;
  }

  if (joined.includes("prompt") || joined.includes("caption") || joined.includes("brief")) {
    return "writing" as const;
  }

  if (joined.includes("final")) {
    return "finalizing" as const;
  }

  return "generating" as const;
}

function buildFalPrompt(draft: DraftRequest, plan: PlanRecord["plan"]) {
  return [
    plan.safePrompt,
    `Identity anchors: ${plan.identityAnchors.join("; ")}`,
    `Scene guardrails: ${plan.sceneGuardrails.join("; ")}`,
    `Keep these cues from the photo: ${plan.keepFromPhoto.join("; ")}`,
    `Negative constraints: ${plan.negativePrompt}`
  ].join(" ");
}

function dataUrlToBlob(dataUrl: string, name: string) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const bytes = Buffer.from(data, "base64");
  return new File([bytes], name, { type: mime });
}

function extractVideoUrl(data: unknown) {
  if (typeof data !== "object" || !data) {
    return undefined;
  }

  const candidate = data as {
    video?: { url?: string };
    videos?: Array<{ url?: string }>;
  };

  return candidate.video?.url || candidate.videos?.[0]?.url;
}
