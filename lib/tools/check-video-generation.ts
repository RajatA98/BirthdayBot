import { fal } from "@fal-ai/client";

import { JobRecord, JobStage } from "@/lib/types";

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

export async function checkVideoGenerationTool(job: JobRecord) {
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

    const providerStatus = String(status.status);

    if (providerStatus === "COMPLETED") {
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

    if (providerStatus === "IN_PROGRESS") {
      const logs = getStatusLogs(status);
      const providerStage = inferProviderStage(logs);
      return {
        stage: providerStage,
        statusMessage:
          logs?.at(-1)?.message || stageMessages[providerStage]
      };
    }

    if (providerStatus === "IN_QUEUE") {
      return {
        stage: "queued" as const,
        statusMessage: stageMessages.queued
      };
    }

    return {
      stage: "failed" as const,
      statusMessage: "The provider returned an unexpected generation state.",
      error: `Unexpected provider state: ${providerStatus}`
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
  const joined = logs?.map((entry) => entry.message?.toLowerCase() || "").join(" ");

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

function getStatusLogs(status: unknown) {
  if (typeof status !== "object" || !status || !("logs" in status)) {
    return undefined;
  }

  const candidate = (status as { logs?: Array<{ message?: string }> }).logs;
  return Array.isArray(candidate) ? candidate : undefined;
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
