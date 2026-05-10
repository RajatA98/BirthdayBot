import { fal } from "@fal-ai/client";

import { getLangfuse } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import { buildFalInput } from "@/lib/tools/build-video-input";
import { createVoiceOver } from "@/lib/tools/create-voice-over";
import {
  generateAiMusicBed,
  generateBirthdaySong
} from "@/lib/tools/generate-music-bed";
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

  fal.config({ credentials: apiKey });

  const targetDurationSeconds = targetVideoDurationSeconds(planRecord.draft);
  const requestedVoiceOver = Boolean(
    planRecord.draft.voiceSampleDataUrl || planRecord.draft.voiceSampleClips?.length
  );
  const isSongMode = planRecord.draft.voiceMode === "song";

  const photoStartedAt = Date.now();
  const voiceStartedAt = Date.now();
  const musicStartedAt = Date.now();

  // Song mode replaces voice + ambient-music with a single sung song that
  // becomes the entire audio track. Skip voice cloning and the
  // instrumental music-bed generation; call the song path instead.
  const [uploadedUrl, voiceOver, musicBedUrl] = await Promise.all([
    uploadPhoto(planRecord),
    isSongMode
      ? Promise.resolve({} as Awaited<ReturnType<typeof createVoiceOver>>)
      : createVoiceOver(planRecord, job).then((result) => {
          logTimedTask("voice_over", voiceStartedAt, {
            outcome: result.voiceOverError
              ? "error"
              : result.voiceOverUrl
                ? "ready"
                : "skipped",
            ...(result.voiceOverError
              ? { errorMessage: result.voiceOverError }
              : {})
          });
          return result;
        }),
    isSongMode
      ? uploadBirthdaySong(planRecord, targetDurationSeconds).then((url) => {
          logTimedTask("birthday_song", musicStartedAt, {
            outcome: url ? "ready" : "skipped",
            songStyle: planRecord.draft.songStyle || "Acoustic"
          });
          return url;
        })
      : uploadMusicBed(planRecord, targetDurationSeconds).then((url) => {
          logTimedTask("music_bed", musicStartedAt, {
            outcome: url ? "ready" : "skipped"
          });
          return url;
        })
  ]);

  logTimedTask("photo_upload", photoStartedAt, { outcome: "ready" });

  const videoDraft = requestedVoiceOver
    ? {
        ...planRecord.draft,
        voiceSampleName: planRecord.draft.voiceSampleName || "voice sample",
        voiceSampleDataUrl: "provided"
      }
    : planRecord.draft;

  const endpoint =
    getServerEnv("FAL_VIDEO_MODEL") ||
    "fal-ai/kling-video/v3/standard/image-to-video";
  // attempts > 1 means the auto-retry kicked in. Pass safeRetry through so
  // buildFalInput uses a stripped-down prompt + lower cfg for a better
  // chance of acceptance after a fal rejection.
  const safeRetry = (job.attempts ?? 1) > 1;
  const input = buildFalInput(
    endpoint,
    uploadedUrl,
    videoDraft,
    planRecord.plan,
    planRecord.caption,
    { safeRetry }
  );

  logGenerationPayload({
    endpoint,
    duration: input.duration || "10",
    aspectRatio: input.aspect_ratio || "9:16",
    requestId: planRecord.requestId,
    subjectCount: planRecord.plan.subjectCount,
    prompt: input.prompt
  });

  const submitStartedAt = Date.now();
  const result = await fal.queue.submit(endpoint, { input });

  if (
    !result?.request_id ||
    typeof result.request_id !== "string" ||
    result.request_id.trim() === ""
  ) {
    logTimedTask("fal_submit", submitStartedAt, {
      outcome: "rejected",
      providerRequestId: result?.request_id
    });
    throw new Error(
      `Video provider accepted the request but returned no job id. Submit response: ${safeStringify(
        result
      )}`
    );
  }

  logTimedTask("fal_submit", submitStartedAt, {
    outcome: "queued",
    providerRequestId: result.request_id
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

  const seededLogs = [
    {
      message: "Brief approved. Spinning up the production crew.",
      timestamp: photoStartedAt,
      source: "system" as const
    },
    voiceOver.voiceOverUrl
      ? {
          message: "Voice clone is locked in.",
          timestamp: Date.now(),
          source: "system" as const
        }
      : undefined,
    musicBedUrl
      ? {
          message: "Custom music bed composed.",
          timestamp: Date.now(),
          source: "system" as const
        }
      : undefined,
    {
      message: "Director's brief sent to the video model.",
      timestamp: Date.now(),
      source: "system" as const
    }
  ].filter(Boolean) as Array<{
    message: string;
    timestamp: number;
    source: "system";
  }>;

  return {
    ...job,
    ...voiceOver,
    musicBedUrl,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint,
    targetDurationSeconds,
    voiceMode: planRecord.draft.voiceMode || "narrate",
    logs: seededLogs
  };
}

async function uploadPhoto(planRecord: PlanRecord) {
  if (planRecord.draft.photoDataUrl.startsWith("http")) {
    return planRecord.draft.photoDataUrl;
  }

  return fal.storage.upload(
    dataUrlToBlob(planRecord.draft.photoDataUrl, planRecord.draft.photoName)
  );
}

async function uploadBirthdaySong(
  planRecord: PlanRecord,
  targetDurationSeconds: number
) {
  const buffer = await generateBirthdaySong(
    planRecord.draft,
    planRecord.plan,
    planRecord.caption,
    targetDurationSeconds
  );
  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }
  try {
    const file = new File([new Uint8Array(buffer)], "birthday-song.mp3", {
      type: "audio/mpeg"
    });
    return await fal.storage.upload(file);
  } catch (error) {
    console.warn(
      "[birthdaybot:start_video_generation] birthday song upload failed",
      error
    );
    return undefined;
  }
}

async function uploadMusicBed(
  planRecord: PlanRecord,
  targetDurationSeconds: number
) {
  const buffer = await generateAiMusicBed(
    planRecord.draft,
    planRecord.plan,
    targetDurationSeconds
  );

  if (!buffer || buffer.byteLength === 0) {
    return undefined;
  }

  try {
    const file = new File([new Uint8Array(buffer)], "birthday-music-bed.mp3", {
      type: "audio/mpeg"
    });
    return await fal.storage.upload(file);
  } catch (error) {
    console.warn(
      "[birthdaybot:start_video_generation] music bed upload failed",
      error
    );
    return undefined;
  }
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

function logTimedTask(
  task: string,
  startedAt: number,
  metadata: Record<string, unknown>
) {
  console.info(`[birthdaybot:start_video_generation:${task}]`, {
    durationMs: Date.now() - startedAt,
    ...metadata
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}
