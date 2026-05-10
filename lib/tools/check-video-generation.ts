import { fal } from "@fal-ai/client";

import { emitTraceEvent } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import {
  muxSongIntoVideo,
  muxVoiceOverIntoVideo
} from "@/lib/tools/mux-voice-over";
import { JobLogEntry, JobRecord, JobStage } from "@/lib/types";

const maxRetainedLogs = 40;

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

const providerTimeoutMs = 6 * 60 * 1000;

export async function checkVideoGenerationTool(job: JobRecord) {
  const apiKey = getServerEnv("FAL_KEY");

  if (job.stage === "completed" && job.videoUrl) {
    return {
      stage: "completed" as const,
      statusMessage: job.statusMessage,
      videoUrl: job.videoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  if (job.stage === "failed") {
    return {
      stage: "failed" as const,
      statusMessage: job.statusMessage,
      error: job.error,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

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

    let status: Awaited<ReturnType<typeof fal.queue.status>>;

    try {
      status = await fal.queue.status(job.providerEndpoint, {
        requestId: job.providerRequestId,
        logs: true
      });
    } catch (error) {
      return {
        stage: "failed" as const,
        statusMessage: "The video provider rejected this generation request.",
        error: providerFailureMessage(error)
      };
    }

    const providerStatus = String(status.status);

    if (providerStatus === "COMPLETED") {
      emitTraceEvent("fal-completed", {
        requestId: job.requestId,
        providerRequestId: job.providerRequestId
      });
      let result: Awaited<ReturnType<typeof fal.queue.result>>;

      try {
        result = await fal.queue.result(job.providerEndpoint, {
          requestId: job.providerRequestId
        });
      } catch (error) {
        return {
          stage: "failed" as const,
          statusMessage: "The provider finished but the final video could not be retrieved.",
          error: providerFailureMessage(error)
        };
      }
      const videoUrl = extractVideoUrl(result.data);

      if (!videoUrl) {
        return {
          stage: "failed" as const,
          statusMessage: "The provider completed without a usable video URL.",
          error: "Missing video URL from provider response."
        };
      }

      const finalVideo = await resolveFinalVideoUrl(videoUrl, job);

      return {
        stage: "completed" as const,
        statusMessage: stageMessages.completed,
        videoUrl: finalVideo.videoUrl,
        voiceOverUrl: finalVideo.voiceOverUrl,
        voiceOverError: finalVideo.voiceOverError
      };
    }

    if (providerStatus === "IN_PROGRESS") {
      const rawLogs = getStatusLogs(status);
      const providerStage = inferProviderStage(rawLogs);
      const mergedLogs = mergeJobLogs(job.logs, rawLogs);
      emitTraceEvent("fal-poll", {
        requestId: job.requestId,
        stage: providerStage,
        logsCount: rawLogs?.length || 0
      });
      return {
        stage: providerStage,
        statusMessage:
          rawLogs?.at(-1)?.message || stageMessages[providerStage],
        logs: mergedLogs
      };
    }

    if (providerStatus === "IN_QUEUE") {
      return {
        stage: "queued" as const,
        statusMessage: stageMessages.queued,
        logs: job.logs
      };
    }

    return {
      stage: "failed" as const,
      statusMessage: "The provider returned an unexpected generation state.",
      error: `Unexpected provider state: ${providerStatus}`
    };
  }

  if (!apiKey) {
    return {
      stage: "failed" as const,
      statusMessage: "Video generation is not configured.",
      error:
        "FAL_KEY is required to generate a personalized video. The stock demo fallback is disabled.",
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  return {
    stage: "failed" as const,
    statusMessage: "Video provider didn't return a job id.",
    error:
      "The video provider accepted the request but never assigned a job id. The job has been marked failed; the auto-retry will try again with a safer prompt.",
    voiceOverUrl: job.voiceOverUrl,
    voiceOverError: job.voiceOverError
  };
}

function providerFailureMessage(error: unknown) {
  if (error instanceof Error) {
    const apiError = error as Error & { status?: number; body?: unknown };
    const detail = formatApiErrorBody(apiError.body);
    const baseMessage = apiError.message || "Provider request failed.";

    if (detail && !baseMessage.includes(detail)) {
      return apiError.status
        ? `${baseMessage} (${apiError.status}): ${detail}`
        : `${baseMessage}: ${detail}`;
    }

    return apiError.status && !baseMessage.includes(String(apiError.status))
      ? `${baseMessage} (${apiError.status})`
      : baseMessage;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Provider request failed.";
  }
}

function formatApiErrorBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;

  const candidate = body as {
    detail?: unknown;
    message?: string;
    error?: string;
  };

  if (Array.isArray(candidate.detail)) {
    const messages = candidate.detail
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const item = entry as { loc?: unknown[]; msg?: unknown };
          const path = Array.isArray(item.loc)
            ? item.loc
                .filter((part) => part !== "body")
                .map((part) => String(part))
                .join(".")
            : undefined;
          const msg = typeof item.msg === "string" ? item.msg : undefined;
          if (path && msg) return `${path}: ${msg}`;
          return msg;
        }
        return undefined;
      })
      .filter((value): value is string => Boolean(value));
    if (messages.length) return messages.join("; ");
  }

  if (typeof candidate.detail === "string") return candidate.detail;
  if (typeof candidate.message === "string") return candidate.message;
  if (typeof candidate.error === "string") return candidate.error;

  return undefined;
}

async function resolveFinalVideoUrl(videoUrl: string, job: JobRecord) {
  // Song mode: no voice-over, the song IS the audio. Mux the song as the
  // sole audio track over the silent fal video.
  if (job.voiceMode === "song" && job.musicBedUrl) {
    try {
      const songVideoUrl = await muxSongIntoVideo(
        videoUrl,
        job.musicBedUrl,
        job.targetDurationSeconds
      );
      return {
        videoUrl: songVideoUrl,
        voiceOverUrl: undefined,
        voiceOverError: undefined
      };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Song muxing failed.";
      return {
        videoUrl,
        voiceOverUrl: undefined,
        voiceOverError: `Birthday song generation finished, but it could not be merged into the MP4. Preview will play it separately. ${detail}`
      };
    }
  }

  if (!job.voiceOverUrl) {
    return {
      videoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  try {
    const voicedVideoUrl = await muxVoiceOverIntoVideo(
      videoUrl,
      job.voiceOverUrl,
      job.targetDurationSeconds,
      job.musicBedUrl
    );

    return {
      videoUrl: voicedVideoUrl,
      voiceOverUrl: undefined,
      voiceOverError: job.voiceOverError
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Voice-over muxing failed.";

    return {
      videoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: `${job.voiceOverError ? `${job.voiceOverError} ` : ""}Cloned voice-over was generated, but it could not be merged into the MP4. Preview will play it separately. ${detail}`
    };
  }
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

function mergeJobLogs(
  existing: JobLogEntry[] | undefined,
  fresh: Array<{ message?: string; timestamp?: string | number }> | undefined
): JobLogEntry[] {
  const merged: JobLogEntry[] = existing ? [...existing] : [];
  const seen = new Set(merged.map((entry) => entry.message));

  for (const entry of fresh || []) {
    const message = entry.message?.trim();
    if (!message || seen.has(message)) continue;
    seen.add(message);
    merged.push({
      message,
      timestamp: parseLogTimestamp(entry.timestamp) ?? Date.now(),
      source: "provider"
    });
  }

  if (merged.length > maxRetainedLogs) {
    return merged.slice(merged.length - maxRetainedLogs);
  }

  return merged;
}

function parseLogTimestamp(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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
