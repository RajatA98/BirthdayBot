import { fal } from "@fal-ai/client";

import { getLangfuse } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import { buildFalInput } from "@/lib/tools/build-video-input";
import { createVoiceOver } from "@/lib/tools/create-voice-over";
import { JobRecord, PlanRecord } from "@/lib/types";

export async function startVideoGenerationTool(
  planRecord: PlanRecord,
  job: JobRecord
) {
  const apiKey = getServerEnv("FAL_KEY");

  if (!apiKey) {
    return {
      ...job,
      stage: "failed" as const,
      statusMessage: "Video generation is not configured.",
      error: "FAL_KEY is required to generate a personalized video."
    };
  }

  const requestedVoiceOver = Boolean(planRecord.draft.voiceSampleDataUrl);
  const voiceOver = await createVoiceOver(planRecord, job);
  const videoDraft = requestedVoiceOver
    ? {
        ...planRecord.draft,
        voiceSampleName: planRecord.draft.voiceSampleName || "voice sample",
        voiceSampleDataUrl: "provided"
      }
    : planRecord.draft;

  fal.config({
    credentials: apiKey
  });

  const endpoint = getServerEnv("FAL_VIDEO_MODEL") || "fal-ai/kling-video/v3/standard/image-to-video";
  const uploadedUrl = planRecord.draft.photoDataUrl.startsWith("http")
    ? planRecord.draft.photoDataUrl
    : await fal.storage.upload(
        dataUrlToBlob(planRecord.draft.photoDataUrl, planRecord.draft.photoName)
      );
  const input = buildFalInput(
    endpoint,
    uploadedUrl,
    videoDraft,
    planRecord.plan,
    planRecord.caption
  );

  logGenerationPayload({
    endpoint,
    duration: input.duration || "10",
    aspectRatio: input.aspect_ratio || "9:16",
    requestId: planRecord.requestId,
    subjectCount: planRecord.plan.subjectCount,
    prompt: input.prompt
  });

  const result = await fal.queue.submit(endpoint, {
    input
  });

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "video-generation",
    input: { endpoint, prompt: input.prompt, jobId: job.jobId },
    metadata: { requestId: job.requestId }
  });
  trace?.event?.({
    name: "fal-submitted",
    input: { requestId: result.request_id, endpoint }
  });
  await langfuse?.flushAsync?.();

  return {
    ...job,
    ...voiceOver,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint,
    targetDurationSeconds: targetVideoDurationSeconds(planRecord.draft)
  };
}

function targetVideoDurationSeconds(draft: PlanRecord["draft"]) {
  const requested =
    draft.mode === "advanced" ? draft.advanced.videoLength : "15 seconds";
  return Number(requested.match(/\d+/)?.[0] || "15");
}

function dataUrlToBlob(dataUrl: string, name: string) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const bytes = Buffer.from(data, "base64");
  return new File([bytes], name, { type: mime });
}

function logGenerationPayload({
  endpoint,
  duration,
  aspectRatio,
  requestId,
  subjectCount,
  prompt
}: {
  endpoint: string;
  duration: string;
  aspectRatio: string;
  requestId: string;
  subjectCount: number;
  prompt: string;
}) {
  console.info("[birthdaybot:start_video_generation]", {
    endpoint,
    duration,
    aspectRatio,
    requestId,
    subjectCount,
    promptPreview: prompt.slice(0, 240)
  });
}
