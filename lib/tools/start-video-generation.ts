import { fal } from "@fal-ai/client";

import { JobRecord, PlanRecord } from "@/lib/types";

export async function startVideoGenerationTool(
  planRecord: PlanRecord,
  job: JobRecord
) {
  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return job;
  }

  fal.config({
    credentials: apiKey
  });

  const endpoint =
    process.env.FAL_VIDEO_MODEL ||
    "fal-ai/kling-video/v3/standard/image-to-video";
  const duration = normalizeDuration(planRecord.draft.advanced.videoLength);
  const aspectRatio = normalizeAspectRatio(
    planRecord.draft.advanced.aspectRatio
  );
  const prompt = buildFalPrompt(planRecord);

  logGenerationPayload({
    endpoint,
    duration,
    aspectRatio,
    requestId: planRecord.requestId,
    subjectCount: planRecord.plan.subjectCount,
    prompt
  });
  const uploadedUrl = planRecord.draft.photoDataUrl.startsWith("http")
    ? planRecord.draft.photoDataUrl
    : await fal.storage.upload(
        dataUrlToBlob(planRecord.draft.photoDataUrl, planRecord.draft.photoName)
      );

  const result = await fal.queue.submit(endpoint, {
    input: {
      image_url: uploadedUrl,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      negative_prompt: planRecord.plan.negativePrompt
    }
  });

  return {
    ...job,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint
  };
}

function buildFalPrompt(planRecord: PlanRecord) {
  const { plan } = planRecord;
  return [
    plan.safePrompt,
    `Identity anchors: ${plan.identityAnchors.join("; ")}`,
    `Scene guardrails: ${plan.sceneGuardrails.join("; ")}`,
    `Keep these cues from the photo: ${plan.keepFromPhoto.join("; ")}`,
    `Negative constraints: ${plan.negativePrompt}`
  ].join(" ");
}

function normalizeDuration(value: string) {
  if (value.includes("10")) {
    return "10";
  }

  return "5";
}

function normalizeAspectRatio(value: string) {
  if (value === "Landscape") {
    return "16:9";
  }

  if (value === "Square") {
    return "1:1";
  }

  return "9:16";
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
