import { fal } from "@fal-ai/client";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

import { getLangfuse } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import { DraftRequest, JobRecord, JobStage, PlanRecord } from "@/lib/types";

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
const defaultFalVideoModel = "fal-ai/kling-video/v3/standard/image-to-video";
const elevenLabsBaseUrl = "https://api.elevenlabs.io/v1";
const defaultElevenLabsTtsModel = "eleven_multilingual_v2";
const execFileAsync = promisify(execFile);

export async function startVideoGeneration(planRecord: PlanRecord, job: JobRecord) {
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
  const voiceOver = await createElevenLabsVoiceOver(planRecord, job);
  const videoDraft: DraftRequest = requestedVoiceOver
    ? {
        ...planRecord.draft,
        voiceSampleName: planRecord.draft.voiceSampleName || "voice sample",
        voiceSampleDataUrl: "provided"
      }
    : planRecord.draft;

  fal.config({
    credentials: apiKey
  });

  const uploadedUrl = planRecord.draft.photoDataUrl.startsWith("http")
    ? planRecord.draft.photoDataUrl
    : await fal.storage.upload(
        dataUrlToBlob(planRecord.draft.photoDataUrl, planRecord.draft.photoName)
      );
  const endpoint = selectVideoEndpoint();
  const input = buildFalInput(
    endpoint,
    uploadedUrl,
    videoDraft,
    planRecord.plan,
    planRecord.caption
  );
  const result = await fal.queue.submit(endpoint, { input });

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "video-generation",
    input: { endpoint, prompt: input.prompt, jobId: job.jobId },
    metadata: { requestId: job.requestId }
  });
  trace?.event({ name: "fal-submitted", input: { requestId: result.request_id, endpoint } });
  await langfuse?.flushAsync();

  return {
    ...job,
    ...voiceOver,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint
  };
}

export async function resolveJobStatus(job: JobRecord) {
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

      const finalVideo = await resolveFinalVideoUrl(videoUrl, job);

      return {
        stage: "completed" as const,
        statusMessage: stageMessages.completed,
        videoUrl: finalVideo.videoUrl,
        voiceOverUrl: finalVideo.voiceOverUrl,
        voiceOverError: finalVideo.voiceOverError
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

  return {
    stage: "failed" as const,
    statusMessage: "Video generation is not configured.",
    error:
      "FAL_KEY is required to generate a personalized video. The stock demo fallback is disabled.",
    voiceOverUrl: job.voiceOverUrl,
    voiceOverError: job.voiceOverError
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

type FalVideoInput = {
  prompt: string;
  image_url?: string;
  start_image_url?: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  generate_audio?: boolean;
};

export function buildFalInput(
  endpoint: string,
  imageUrl: string,
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string
): FalVideoInput {
  const input: FalVideoInput = supportsStartImageUrl(endpoint)
    ? {
        start_image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption)
      }
    : {
        image_url: imageUrl,
        prompt: buildFalPrompt(draft, plan, caption)
      };

  input.duration = durationForEndpoint(endpoint, draft);
  input.aspect_ratio = aspectRatioForDraft(draft);
  input.negative_prompt =
    "blur, distort, low quality, watermark, misspelled text, broken letters, garbled caption, distorted hands, extra faces, changed identity";
  input.cfg_scale = 0.65;

  if (supportsNativeAudio(endpoint) && !hasVoiceSample(draft)) {
    input.generate_audio = true;
  }

  return input;
}

export function buildFalPrompt(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption = ""
) {
  const advancedDirection =
    draft.mode === "advanced"
      ? [
          `Tone: ${draft.advanced.tone}`,
          `Scene idea: ${draft.advanced.sceneIdea}`,
          `Length target: ${draft.advanced.videoLength}`,
          `Aspect ratio: ${draft.advanced.aspectRatio}`,
          `Music vibe: ${draft.advanced.musicVibe}`,
          `Motion intensity: ${draft.advanced.motionIntensity}`
        ].join(". ")
      : "Use a warm, sendable birthday-video style.";
  const textDirection = buildTextDirection(draft, caption);
  const musicDirection = buildMusicDirection(draft);

  return [
    "Create a short cinematic birthday celebration video from the uploaded photo.",
    `User video prompt: ${draft.prompt}`,
    "Treat the user video prompt as the main creative direction for the generated video.",
    textDirection,
    musicDirection,
    "Make the video clearly feel like a birthday celebration with tasteful party details such as candles, cake, balloons, confetti, gifts, warm smiles, celebratory lighting, or a joyful reveal when they fit the scene.",
    "Keep the people recognizable and preserve identity, facial features, clothing cues, and the relationship shown in the source photo.",
    `Concept: ${plan.concept}`,
    `Scene direction: ${plan.sceneDirection}`,
    `Motion direction: ${plan.motionDirection}`,
    `Generation strategy: ${plan.generationStrategy}`,
    `Advanced direction: ${advancedDirection}`,
    `Keep these cues from the photo: ${plan.keepFromPhoto.join("; ")}.`,
    "Avoid text artifacts, watermarks, distorted hands, extra faces, or changing the subject's identity."
  ].join(" ");
}

function buildTextDirection(draft: DraftRequest, caption: string) {
  const style =
    draft.mode === "advanced" && draft.advanced.captionStyle !== "None"
      ? draft.advanced.captionStyle.toLowerCase()
      : "subtle";
  const text = birthdayOverlayText(caption);

  return `Embed tasteful ${style} on-screen birthday text directly in the video frames, not as a separate caption outside the video. Show a warm "Happy Birthday!" title followed by this compact 2-3 sentence message: "${text}". Use celebratory text effects: gold, coral, and champagne gradient lettering, gentle shimmer, soft glow, subtle scale-in reveal, and tiny confetti or sparkle accents. Avoid plain white text.`;
}

function buildMusicDirection(draft: DraftRequest) {
  const musicVibe =
    draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting";

  if (hasVoiceSample(draft)) {
    return "Do not generate spoken narration, synthetic dialogue, or native soundtrack audio. Leave the MP4 audio-free because the user's cloned ElevenLabs narration will be muxed into the final video after generation.";
  }

  return `Generate native audio in the final MP4 with a ${musicVibe.toLowerCase()} birthday music bed that matches the scene. Keep it as background music or ambient celebration audio, with no spoken narration unless the user explicitly asks for dialogue.`;
}

function hasVoiceSample(draft: DraftRequest) {
  return Boolean(draft.voiceSampleDataUrl);
}

function birthdayVoiceOverText(caption: string) {
  const fallback = "Happy birthday. I hope your day feels as special as you are.";
  const normalized = (caption || fallback).replace(/\s+/g, " ").replaceAll('"', "'");

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trim()}...`;
}

function birthdayOverlayText(caption: string) {
  const fallback = "Happy Birthday! Hope your day feels as special as you are.";
  const normalized = compactCaptionText(caption || fallback).replaceAll('"', "'");

  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trim()}...`;
}

function compactCaptionText(caption: string) {
  const sentences = caption
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences?.length) {
    return "Happy Birthday! Hope your day feels as special as you are.";
  }

  return sentences.slice(0, 3).join(" ");
}

function durationForEndpoint(endpoint: string, draft: DraftRequest) {
  const requested =
    draft.mode === "advanced" ? draft.advanced.videoLength : "10 seconds";
  const seconds = requested.match(/\d+/)?.[0] || "10";

  if (seconds === "15" && !supportsLongDurations(endpoint)) {
    return "10";
  }

  return seconds;
}

function aspectRatioForDraft(draft: DraftRequest) {
  const aspectRatio =
    draft.mode === "advanced" ? draft.advanced.aspectRatio : "Portrait";

  switch (aspectRatio) {
    case "Landscape":
      return "16:9";
    case "Square":
      return "1:1";
    case "Portrait":
    default:
      return "9:16";
  }
}

function supportsStartImageUrl(endpoint: string) {
  return /\/v(2\.6|3)|\/master\//.test(endpoint);
}

function supportsNativeAudio(endpoint: string) {
  return /\/v(2\.6|3)|\/master\//.test(endpoint);
}

function supportsLongDurations(endpoint: string) {
  return /\/v3|\/master\//.test(endpoint);
}

function selectVideoEndpoint() {
  const configuredEndpoint = getServerEnv("FAL_VIDEO_MODEL");

  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  return defaultFalVideoModel;
}

type VoiceOverResult = {
  providerVoiceId?: string;
  voiceOverUrl?: string;
  voiceOverError?: string;
};

async function createElevenLabsVoiceOver(
  planRecord: PlanRecord,
  job: JobRecord
): Promise<VoiceOverResult> {
  if (job.voiceOverUrl || job.voiceOverError || job.providerVoiceId) {
    return {
      providerVoiceId: job.providerVoiceId,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  const draft = planRecord.draft;

  if (!draft.voiceSampleDataUrl) {
    return {};
  }

  if (!draft.voiceConsent) {
    return {
      voiceOverError:
        "Voice-over skipped because voice-cloning consent was not confirmed."
    };
  }

  const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");

  if (!apiKey) {
    return {
      voiceOverError:
        "ELEVENLABS_API_KEY is required to generate a cloned voice-over."
    };
  }

  let voiceId: string | undefined;

  try {
    voiceId = await createElevenLabsVoice(draft, apiKey);
    const voiceOverUrl = await createElevenLabsSpeech(
      voiceId,
      birthdayVoiceOverText(planRecord.caption),
      apiKey
    );

    draft.voiceSampleName = undefined;
    draft.voiceSampleDataUrl = undefined;
    draft.voiceConsent = undefined;

    return {
      providerVoiceId: voiceId,
      voiceOverUrl
    };
  } catch (error) {
    return {
      providerVoiceId: voiceId,
      voiceOverError:
        error instanceof Error
          ? error.message
          : "ElevenLabs voice-over generation failed."
    };
  } finally {
    if (voiceId) {
      await deleteElevenLabsVoice(voiceId, apiKey);
    }
  }
}

async function createElevenLabsVoice(draft: DraftRequest, apiKey: string) {
  const form = new FormData();
  const voiceSample = dataUrlToBlob(
    draft.voiceSampleDataUrl || "",
    draft.voiceSampleName || "voice-sample.webm"
  );

  form.append("name", `BirthdayBot voice ${Date.now()}`);
  form.append("files", voiceSample);
  form.append("remove_background_noise", "true");
  form.append("description", "Temporary BirthdayBot voice-over voice.");

  const response = await fetch(`${elevenLabsBaseUrl}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(await providerErrorMessage(response, "ElevenLabs voice cloning failed."));
  }

  const body = (await response.json()) as {
    voice_id?: string;
    requires_verification?: boolean;
  };

  if (!body.voice_id) {
    throw new Error("Missing voice ID from ElevenLabs response.");
  }

  if (body.requires_verification) {
    throw new Error("ElevenLabs requires verification before this voice can be used.");
  }

  return body.voice_id;
}

async function createElevenLabsSpeech(
  voiceId: string,
  text: string,
  apiKey: string
) {
  const response = await fetch(
    `${elevenLabsBaseUrl}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text,
        model_id: getServerEnv("ELEVENLABS_TTS_MODEL") || defaultElevenLabsTtsModel,
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.86,
          style: 0.12,
          use_speaker_boost: true
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(await providerErrorMessage(response, "ElevenLabs speech generation failed."));
  }

  const contentType = response.headers.get("content-type") || "audio/mpeg";
  const bytes = Buffer.from(await response.arrayBuffer());

  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function deleteElevenLabsVoice(voiceId: string, apiKey: string) {
  await fetch(`${elevenLabsBaseUrl}/voices/${voiceId}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": apiKey
    }
  }).catch(() => undefined);
}

async function resolveFinalVideoUrl(videoUrl: string, job: JobRecord) {
  if (!job.voiceOverUrl) {
    return {
      videoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  try {
    const voicedVideoUrl = await muxVoiceOverIntoVideo(videoUrl, job.voiceOverUrl);

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

async function muxVoiceOverIntoVideo(videoUrl: string, voiceOverUrl: string) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available.");
  }

  const workspace = await mkdtemp(join(tmpdir(), "birthdaybot-voice-"));

  try {
    const video = await mediaUrlToBuffer(videoUrl);
    const voiceOver = await mediaUrlToBuffer(voiceOverUrl);
    const inputVideo = join(workspace, "input.mp4");
    const inputVoice = join(workspace, "voice-over.mp3");
    const outputVideo = join(workspace, "voiced-output.mp4");

    await writeFile(inputVideo, video.bytes);
    await writeFile(inputVoice, voiceOver.bytes);

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputVideo,
      "-i",
      inputVoice,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-af",
      "apad",
      "-shortest",
      "-movflags",
      "+faststart",
      outputVideo
    ]);

    const outputBytes = await readFile(outputVideo);

    return fal.storage.upload(
      new File([outputBytes], "birthday-video-with-voice.mp4", {
        type: "video/mp4"
      })
    );
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

async function mediaUrlToBuffer(url: string) {
  if (url.startsWith("data:")) {
    const [header, data] = url.split(",");
    const mime = header.match(/data:(.*);base64/)?.[1] || "application/octet-stream";

    return {
      bytes: Buffer.from(data, "base64"),
      mime
    };
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await providerErrorMessage(response, "Media download failed."));
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get("content-type") || "application/octet-stream"
  };
}

async function providerErrorMessage(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  const compactBody = body.replace(/\s+/g, " ").trim();

  if (!compactBody) {
    return fallback;
  }

  return `${fallback} ${compactBody.slice(0, 240)}`;
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
