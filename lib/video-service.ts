import { fal } from "@fal-ai/client";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const partyMusicAssetPath = join(
  process.cwd(),
  "public",
  "audio",
  "party-music.mp3"
);
const falMaxUploadBytes = 10_485_760;
const falTargetImageUploadBytes = 9_500_000;
const defaultVideoDurationSeconds = 15;
const maxMuxedVideoDurationSeconds = 20;
const finalVideoAudioBitrateKbps = 96;
const finalVideoBitrateKbps = 4500;
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
        await providerReadyImageFile(
          planRecord.draft.photoDataUrl,
          planRecord.draft.photoName
        )
      );
  const endpoint = selectVideoEndpoint();
  const input = buildFalInput(
    endpoint,
    uploadedUrl,
    videoDraft,
    planRecord.plan,
    planRecord.caption,
    { safeRetry: job.attempts > 1 }
  );
  const submission = await submitFalVideoJob(endpoint, input);
  const result = submission.result;

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "video-generation",
    input: { endpoint, prompt: submission.input.prompt, jobId: job.jobId },
    metadata: { requestId: job.requestId, usedSchemaFallback: submission.usedSchemaFallback }
  });
  trace?.event({ name: "fal-submitted", input: { requestId: result.request_id, endpoint } });
  await langfuse?.flushAsync();

  return {
    ...job,
    ...voiceOver,
    providerRequestId: result.request_id,
    providerEndpoint: endpoint,
    targetDurationSeconds: targetVideoDurationSeconds(planRecord.draft)
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

    let status: Awaited<ReturnType<typeof fal.queue.status>>;

    try {
      status = await fal.queue.status(job.providerEndpoint, {
        requestId: job.providerRequestId,
        logs: true
      });
    } catch (error) {
      return providerPollingFailure(error, "Provider status lookup failed.");
    }

    const state = status.status;

    if (state === "COMPLETED") {
      let result: Awaited<ReturnType<typeof fal.queue.result>>;

      try {
        result = await fal.queue.result(job.providerEndpoint, {
          requestId: job.providerRequestId
        });
      } catch (error) {
        return providerPollingFailure(error, "Provider result lookup failed.");
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
  prompt?: string;
  multi_prompt?: Array<{
    prompt: string;
    duration: string;
  }>;
  image_url?: string;
  start_image_url?: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  generate_audio?: boolean;
  shot_type?: "customize";
};

export function buildFalInput(
  endpoint: string,
  imageUrl: string,
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string,
  options: { safeRetry?: boolean } = {}
): FalVideoInput {
  const prompt = compactProviderPrompt(
    options.safeRetry
      ? buildSafeRetryFalPrompt(draft, plan)
      : buildFalPrompt(draft, plan, caption),
    maxProviderPromptCharacters(endpoint)
  );
  const input: FalVideoInput = supportsStartImageUrl(endpoint)
    ? {
        start_image_url: imageUrl,
        prompt
      }
    : {
        image_url: imageUrl,
        prompt
      };

  const targetDuration = targetVideoDurationSeconds(draft);
  const providerMax = maxProviderDurationForEndpoint(endpoint);

  input.duration = String(Math.min(targetDuration, providerMax));

  if (options.safeRetry) {
    input.duration = "5";

    if (supportsNativeAudio(endpoint)) {
      input.generate_audio = false;
    }

    return input;
  }

  if (supportsNegativePrompt(endpoint)) {
    input.negative_prompt =
      "blur, distort, low quality, watermark, misspelled text, broken letters, garbled caption, distorted hands, extra faces, changed identity";
  }

  if (supportsCfgScale(endpoint)) {
    input.cfg_scale = 0.65;
  }

  if (supportsAspectRatio(endpoint)) {
    input.aspect_ratio = aspectRatioForDraft(draft);
  }

  if (supportsNativeAudio(endpoint)) {
    input.generate_audio = !hasVoiceSample(draft);
  }

  return input;
}

function buildSafeRetryFalPrompt(draft: DraftRequest, plan: PlanRecord["plan"]) {
  const birthdayName = draft.birthdayName?.trim();
  const nameDirection = birthdayName
    ? `Make the mood feel like a birthday celebration for ${providerSafeText(birthdayName)}.`
    : "Make the mood feel like a warm birthday celebration.";

  return providerSafeText(
    [
      "Create a cheerful birthday party video from the uploaded photo.",
      nameDirection,
      "Preserve the main people naturally and keep faces, clothing, and identity cues close to the source photo.",
      "Add balloons, confetti, cake candles, wrapped gifts, warm party lights, and a gentle camera push-in.",
      `Use this simple visual concept: ${providerSafeText(plan.concept)}`,
      "Keep the scene wholesome, realistic, and artifact-free.",
      "Do not add captions, subtitles, logos, labels, or watermarks."
    ].join(" ")
  );
}

export function buildFalPrompt(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption = ""
) {
  const userDirection = providerSafeUserPrompt(draft.prompt);
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
  const partyDirection =
    "Transform the scene into a lively birthday party backdrop: decorate it with colorful balloons, streamers, confetti bursts, cake candles, wrapped gifts, warm party lights, and a joyful surprise reveal, but do not add guests, background people, extra faces, or anyone who is not already a subject in the uploaded photo.";

  const prompt = [
    "Create a short cinematic birthday party video and birthday celebration from the uploaded photo.",
    partyDirection,
    "The final video should read as a clear party scene first, not a generic cinematic portrait or plain photo animation.",
    `User visual direction: ${userDirection}`,
    "Treat the user visual direction as the main creative direction for the generated video.",
    "Make it really fun and energetic, with playful reactions, celebratory camera movement, dancing party-light shimmer, confetti timed to the reveal, and a clear birthday-party background instead of a generic cinematic setting.",
    "Keep only the original photo subjects visible, with no added guests or crowd, and preserve their identity, facial features, clothing cues, and relationship shown in the source photo.",
    textDirection,
    musicDirection,
    `Concept: ${providerSafeText(plan.concept)}`,
    `Scene direction: ${providerSafeText(plan.sceneDirection)}`,
    `Motion direction: ${providerSafeText(plan.motionDirection)}`,
    `Generation strategy: ${providerSafeText(plan.generationStrategy)}`,
    `Advanced direction: ${advancedDirection}`,
    `Keep these cues from the photo: ${plan.keepFromPhoto.join("; ")}.`,
    "Avoid text artifacts, watermarks, distorted hands, extra faces, or changing the subject's identity."
  ].join(" ");

  return providerSafeText(prompt);
}

function providerSafeUserPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (isAudioCleanupPrompt(normalized)) {
    return "Create a cheerful birthday party video from the uploaded photo with narration-ready pacing, warm reactions, cake candles, confetti, balloons, dancing party lights, and gentle festive instrumental music underneath.";
  }

  return providerSafeText(normalized);
}

function isAudioCleanupPrompt(prompt: string) {
  const lowered = prompt.toLowerCase();
  const hasAudioRequest =
    /\baudio\b|\bmusic\b|\bnarration\b|\bbackground\b|\bvolume\b/.test(lowered);
  const hasCleanupRequest =
    /\bremove\b|\bclean\b|\blower\b|\breduce\b|\bsuppress\b|\bwithout\b|\bno\b/.test(
      lowered
    );
  const hasHarshCrowdNoise = /\bscreams?\b|\bscreaming\b|\bshouts?\b|\bshouting\b/.test(
    lowered
  );

  return hasAudioRequest && (hasCleanupRequest || hasHarshCrowdNoise);
}

function providerSafeText(text: string) {
  return text
    .replace(/\bscreams?\b/gi, "loud crowd noise")
    .replace(/\bscreaming\b/gi, "loud crowd noise")
    .replace(/\bshouts?\b/gi, "loud crowd noise")
    .replace(/\bshouting\b/gi, "loud crowd noise")
    .replace(/\bremove\s+(?:the\s+)?background\s+audio\b/gi, "keep background audio gentle")
    .replace(/\bremove\s+(?:the\s+)?audio\b/gi, "keep audio gentle")
    .replace(/\bremove\s+harsh\s+audio\b/gi, "keep audio gentle")
    .replace(/\bno\s+harsh\s+audio\b/gi, "gentle audio only")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTextDirection(draft: DraftRequest, caption: string) {
  const style =
    draft.mode === "advanced" && draft.advanced.captionStyle !== "None"
      ? draft.advanced.captionStyle.toLowerCase()
      : "subtle";
  const text = birthdayTextLine(draft, caption);

  return `Embed only this exact tasteful ${style} on-screen birthday text directly in the video frames: "${text}". Do not add any other words, captions, subtitles, lower-thirds, labels, watermarks, or extra text anywhere in the video. Use celebratory text effects: gold, coral, and champagne gradient lettering, gentle shimmer, soft glow, subtle scale-in reveal, and tiny confetti or sparkle accents. Avoid plain white text.`;
}

function buildMusicDirection(draft: DraftRequest) {
  const musicVibe =
    draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting";

  if (hasVoiceSample(draft)) {
    return `Do not generate native audio for the MP4. The final audio will be created after generation from only the user's cloned narration and a low-volume ${musicVibe.toLowerCase()} birthday party music bed. Do not generate spoken narration, synthetic dialogue, singing voices, chants, crowd noise, or voice-like audio.`;
  }

  return `Generate native audio in the final MP4 with a fun ${musicVibe.toLowerCase()} birthday party music bed that matches the scene. Keep it as background music or ambient celebration audio, with no spoken narration unless the user explicitly asks for dialogue.`;
}

function hasVoiceSample(draft: DraftRequest) {
  return Boolean(draft.voiceSampleDataUrl);
}

function birthdayVoiceOverText(caption: string) {
  const fallback = "Happy birthday. I hope today makes you feel celebrated and loved.";
  const cleanedScript = generatedNarrationScript(caption || fallback);
  const shortScript = limitVoiceOverWords(cleanedScript);

  if (shortScript.length <= 260) {
    return shortScript;
  }

  return shortScript.slice(0, 257).trim();
}

function generatedNarrationScript(script: string) {
  const withoutLabels = script
    .replace(/\s+/g, " ")
    .replaceAll('"', "'")
    .replace(/^\s*(?:voice[\s-]?over|narration|script|caption)\s*:\s*/i, "")
    .replace(/^\s*(?:um+|uh+|ah+|erm+|hmm+|okay|ok|testing|test|one two(?: three)?)[,.\s-]+/i, "")
    .replace(/\.+$/g, ".")
    .trim();
  const birthdayStart = withoutLabels.search(/\bhappy birthday\b/i);

  if (birthdayStart > 0 && birthdayStart <= 90) {
    return withoutLabels.slice(birthdayStart).trim();
  }

  return withoutLabels || "Happy birthday. I hope today makes you feel celebrated and loved.";
}

function limitVoiceOverWords(text: string) {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 34) {
    return text;
  }

  return words.slice(0, 34).join(" ");
}

function birthdayTextLine(draft: DraftRequest, caption: string) {
  const name =
    draft.birthdayName?.trim() ||
    birthdayNameFromCaption(caption) ||
    birthdayNameFromPrompt(draft.prompt);

  return name ? `Happy Birthday ${name}` : "Happy Birthday";
}

function birthdayNameFromCaption(caption: string) {
  const match = caption.match(/^happy birthday(?:\s+to)?\s+([^.!?,]+)/i);
  return match?.[1]?.trim() || "";
}

function birthdayNameFromPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const match =
    normalized.match(/\bfor\s+([^,.]+?)(?:,\s*my\b|\.|$)/i) ||
    normalized.match(/\bhappy birthday\s+([^,.!]+)/i);

  return match?.[1]?.trim() || "";
}

function targetVideoDurationSeconds(draft: DraftRequest) {
  const requested =
    draft.mode === "advanced"
      ? draft.advanced.videoLength
      : `${defaultVideoDurationSeconds} seconds`;

  return Number(requested.match(/\d+/)?.[0] || String(defaultVideoDurationSeconds));
}

function maxProviderDurationForEndpoint(endpoint: string) {
  if (/\/v3|\/master\//.test(endpoint)) {
    return 15;
  }

  return 10;
}

function maxProviderPromptCharacters(endpoint: string) {
  if (/kling-video/.test(endpoint)) {
    return 512;
  }

  return 1800;
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

function supportsAspectRatio(endpoint: string) {
  return /kling-video\/v(1|2\.1)\/.+\/image-to-video/.test(endpoint);
}

function supportsCfgScale(endpoint: string) {
  return /kling-video\/v(1|2\.1|3)\/.+\/image-to-video/.test(endpoint);
}

function supportsNegativePrompt(endpoint: string) {
  return /kling-video\/v(1|2\.1|2\.6|3)\/.+\/image-to-video/.test(endpoint);
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

export async function createAccountVoiceClone(input: {
  voiceSampleName: string;
  voiceSampleDataUrl: string;
  voiceConsent: boolean;
}) {
  if (!input.voiceSampleDataUrl) {
    throw new Error("A voice sample is required before cloning your voice.");
  }

  if (!input.voiceConsent) {
    throw new Error("Confirm voice-cloning consent before submitting a voice sample.");
  }

  const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required to clone the account voice.");
  }

  return createElevenLabsVoice(
    {
      mode: "simple",
      birthdayName: "BirthdayBot",
      prompt: "Create the reusable BirthdayBot account voice clone.",
      photoName: "voice-placeholder.png",
      photoDataUrl: "data:image/png;base64,",
      voiceSampleName: input.voiceSampleName,
      voiceSampleDataUrl: input.voiceSampleDataUrl,
      voiceConsent: input.voiceConsent,
      advanced: {
        tone: "Heartfelt",
        sceneIdea: "Birthday party",
        videoLength: "15 seconds",
        aspectRatio: "Portrait",
        captionStyle: "Subtle",
        musicVibe: "Uplifting",
        motionIntensity: "Moderate",
        agentGoalMode: "Surprise me"
      }
    },
    apiKey
  );
}

async function submitFalVideoJob(endpoint: string, input: FalVideoInput) {
  let lastSchemaError: unknown;
  const candidates = buildSubmitCandidates(endpoint, input);

  for (const [index, candidate] of candidates.entries()) {
    try {
      return {
        input: candidate,
        result: await fal.queue.submit(endpoint, { input: candidate }),
        usedSchemaFallback: index > 0
      };
    } catch (error) {
      if (!isUnprocessableEntity(error)) {
        throw error;
      }

      lastSchemaError = error;
    }
  }

  throw lastSchemaError;
}

function buildSubmitCandidates(endpoint: string, input: FalVideoInput) {
  return uniqueFalInputs([
    input,
    buildSchemaFallbackInput(input, endpoint),
    buildMinimalFalInput(input),
    buildMinimalFalInput(input, true)
  ]);
}

function buildSchemaFallbackInput(
  input: FalVideoInput,
  endpoint: string
): FalVideoInput {
  const fallback = { ...input };

  if (fallback.multi_prompt) {
    fallback.prompt = fallback.multi_prompt
      .map((shot) => shot.prompt)
      .join(" ");
    fallback.duration = String(
      Math.min(
        fallback.multi_prompt.reduce(
          (total, shot) => total + Number(shot.duration || 0),
          0
        ) || 15,
        15
      )
    );
    delete fallback.multi_prompt;
    delete fallback.shot_type;
  }

  if (!supportsAspectRatio(endpoint)) {
    delete fallback.aspect_ratio;
  }

  delete fallback.generate_audio;
  delete fallback.cfg_scale;
  delete fallback.negative_prompt;

  return fallback;
}

function buildMinimalFalInput(
  input: FalVideoInput,
  useAlternateImageKey = false
): FalVideoInput {
  const prompt = compactProviderPrompt(
    input.prompt ||
      input.multi_prompt?.map((shot) => shot.prompt).join(" ") ||
      "Create a warm, cinematic birthday celebration video from the uploaded photo.",
    512
  );
  const imageUrl = input.start_image_url || input.image_url;
  const duration = String(Math.min(Number(input.duration || "5") || 5, 5));
  const minimal: FalVideoInput = {
    prompt,
    duration
  };

  if (useAlternateImageKey) {
    if (input.start_image_url) {
      minimal.image_url = imageUrl;
    } else {
      minimal.start_image_url = imageUrl;
    }
  } else if (input.start_image_url) {
    minimal.start_image_url = imageUrl;
  } else {
    minimal.image_url = imageUrl;
  }

  return minimal;
}

function compactProviderPrompt(prompt: string, maxCharacters = 1800) {
  const compact = prompt.replace(/\s+/g, " ").trim();

  if (compact.length <= maxCharacters) {
    return compact;
  }

  const sliced = compact.slice(0, Math.max(0, maxCharacters - 1)).trim();
  const lastSentence = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf(";"),
    sliced.lastIndexOf(",")
  );

  if (lastSentence > maxCharacters * 0.6) {
    return sliced.slice(0, lastSentence).trim();
  }

  return sliced;
}

function uniqueFalInputs(inputs: FalVideoInput[]) {
  const seen = new Set<string>();

  return inputs.filter((input) => {
    const key = JSON.stringify(input);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isUnprocessableEntity(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    body?: string;
  };

  return (
    candidate.status === 422 ||
    candidate.statusCode === 422 ||
    candidate.message?.includes("Unprocessable Entity") ||
    candidate.body?.includes("Unprocessable Entity")
  );
}

function providerPollingFailure(error: unknown, fallback: string) {
  const detail = providerExceptionMessage(error, fallback);

  return {
    stage: "failed" as const,
    statusMessage: isUnprocessableEntity(error)
      ? "The video provider rejected the queued generation request."
      : fallback,
    error: detail
  };
}

function providerExceptionMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      message?: string;
      body?: string;
      status?: number;
      statusCode?: number;
    };
    const message = candidate.message || candidate.body;

    if (message) {
      return message;
    }

    if (candidate.status || candidate.statusCode) {
      return `${fallback} HTTP ${candidate.status || candidate.statusCode}.`;
    }
  }

  return fallback;
}

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

  if (draft.voiceCloneId) {
    const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");

    if (!apiKey) {
      return {
        providerVoiceId: draft.voiceCloneId,
        voiceOverError:
          "ELEVENLABS_API_KEY is required to generate a cloned voice-over."
      };
    }

    try {
      return {
        providerVoiceId: draft.voiceCloneId,
        voiceOverUrl: await createElevenLabsSpeech(
          draft.voiceCloneId,
          birthdayVoiceOverText(planRecord.caption),
          apiKey
        )
      };
    } catch (error) {
      return {
        providerVoiceId: draft.voiceCloneId,
        voiceOverError:
          error instanceof Error
            ? error.message
            : "ElevenLabs voice-over generation failed."
      };
    }
  }

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
          stability: 0.34,
          similarity_boost: 0.86,
          style: 0.82,
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
  const baseVideoUrl = videoUrl;

  if (!job.voiceOverUrl) {
    return {
      videoUrl: baseVideoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: job.voiceOverError
    };
  }

  try {
    const voicedVideoUrl = await muxVoiceOverIntoVideo(
      baseVideoUrl,
      job.voiceOverUrl,
      job.targetDurationSeconds
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
      videoUrl: baseVideoUrl,
      voiceOverUrl: job.voiceOverUrl,
      voiceOverError: `${job.voiceOverError ? `${job.voiceOverError} ` : ""}Cloned voice-over was generated, but it could not be merged into the MP4. Preview will play it separately. ${detail}`
    };
  }
}

async function muxVoiceOverIntoVideo(
  videoUrl: string,
  voiceOverUrl: string,
  targetDurationSeconds = maxMuxedVideoDurationSeconds
) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available.");
  }

  const ffmpegBin = ffmpegPath;
  const workspace = await mkdtemp(join(tmpdir(), "birthdaybot-voice-"));

  try {
    const video = await mediaUrlToBuffer(videoUrl);
    const voiceOver = await mediaUrlToBuffer(voiceOverUrl);
    const inputVideo = join(workspace, "input.mp4");
    const inputVoice = join(workspace, "voice-over.mp3");
    const outputVideo = join(workspace, "voiced-output.mp4");

    await writeFile(inputVideo, video.bytes);
    await writeFile(inputVoice, voiceOver.bytes);

    const muxDurationSeconds = await finalMuxedVideoDurationSeconds(
      ffmpegBin,
      inputVoice,
      targetDurationSeconds
    );

    await muxAndCompressVoiceOver({
      ffmpegBin,
      inputVideo,
      inputVoice,
      outputVideo,
      durationSeconds: muxDurationSeconds,
      videoBitrateKbps: finalVideoBitrateKbps
    });

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

async function muxAndCompressVoiceOver({
  ffmpegBin,
  inputVideo,
  inputVoice,
  outputVideo,
  durationSeconds,
  videoBitrateKbps
}: {
  ffmpegBin: string;
  inputVideo: string;
  inputVoice: string;
  outputVideo: string;
  durationSeconds: number;
  videoBitrateKbps: number;
}) {
  const partyMusicInput = await partyMusicInputArgs();

  await execFileAsync(
    ffmpegBin,
    muxFfmpegArgs({
      inputVideo,
      inputVoice,
      outputVideo,
      partyMusicInput,
      durationSeconds,
      videoBitrateKbps
    })
  );
}

function muxFfmpegArgs({
  inputVideo,
  inputVoice,
  outputVideo,
  partyMusicInput,
  durationSeconds,
  videoBitrateKbps
}: {
  inputVideo: string;
  inputVoice: string;
  outputVideo: string;
  partyMusicInput: string[];
  durationSeconds: number;
  videoBitrateKbps: number;
}) {
  return [
    "-y",
    "-i",
    inputVideo,
    "-i",
    inputVoice,
    ...partyMusicInput,
    "-t",
    String(durationSeconds),
    "-filter_complex",
    "[2:a:0]volume=0.08,apad[party_bed];[1:a:0]volume=1.45,acompressor=threshold=-20dB:ratio=3:attack=6:release=100,alimiter=limit=0.95,apad[voice];[party_bed][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]",
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-vf",
    "scale='if(gte(iw,ih),-2,720)':'if(gte(iw,ih),720,-2)'",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${videoBitrateKbps}k`,
    "-maxrate",
    `${videoBitrateKbps}k`,
    "-bufsize",
    `${videoBitrateKbps * 2}k`,
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    `${finalVideoAudioBitrateKbps}k`,
    "-shortest",
    "-movflags",
    "+faststart",
    outputVideo
  ];
}

async function partyMusicInputArgs() {
  try {
    await access(partyMusicAssetPath);
    return ["-stream_loop", "-1", "-i", partyMusicAssetPath];
  } catch {
    return ["-f", "lavfi", "-i", partyMusicLavfiSource()];
  }
}

async function finalMuxedVideoDurationSeconds(
  ffmpegBin: string,
  inputVoice: string,
  targetDurationSeconds: number
) {
  const target = Math.max(1, targetDurationSeconds || defaultVideoDurationSeconds);
  const voiceDuration = await audioDurationSeconds(ffmpegBin, inputVoice);
  const neededForVoice = Math.ceil((voiceDuration || 0) + 0.75);

  return Math.min(Math.max(target, neededForVoice), maxMuxedVideoDurationSeconds);
}

async function audioDurationSeconds(ffmpegBin: string, inputAudio: string) {
  try {
    const { stderr } = await execFileAsync(ffmpegBin, [
      "-hide_banner",
      "-i",
      inputAudio
    ]);

    return durationSecondsFromFfmpegOutput(stderr);
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr || "")
        : "";

    return durationSecondsFromFfmpegOutput(stderr);
  }
}

function durationSecondsFromFfmpegOutput(output: string) {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    return undefined;
  }

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}

function partyMusicLavfiSource() {
  return [
    "aevalsrc=",
    "'",
    "0.08*sin(2*PI*220*t)*(gt(mod(t\\,0.5)\\,0.08))",
    "+0.06*sin(2*PI*277.18*t)*(gt(mod(t\\,0.5)\\,0.08))",
    "+0.05*sin(2*PI*329.63*t)*(gt(mod(t\\,0.5)\\,0.08))",
    "+0.04*sin(2*PI*440*t)*(gt(mod(t\\,0.25)\\,0.04))",
    "+0.05*sin(2*PI*880*t)*(lt(mod(t\\,1)\\,0.035))",
    "'",
    ":s=44100"
  ].join("");
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

async function providerReadyImageFile(dataUrl: string, name: string) {
  const original = dataUrlToBlob(dataUrl, name);

  if (original.size < falMaxUploadBytes && original.size <= falTargetImageUploadBytes) {
    return original;
  }

  if (!ffmpegPath || !dataUrl.startsWith("data:image/")) {
    if (original.size < falMaxUploadBytes) {
      return original;
    }

    throw new Error(
      `Photo is ${original.size} bytes, which exceeds fal.ai's ${falMaxUploadBytes}-byte upload limit.`
    );
  }

  const ffmpegBin = ffmpegPath;
  const workspace = await mkdtemp(join(tmpdir(), "birthdaybot-image-"));

  try {
    const [header, data] = dataUrl.split(",");
    const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
    const extension = extensionForMimeType(mime);
    const inputImage = join(workspace, `input.${extension}`);

    await writeFile(inputImage, Buffer.from(data, "base64"));

    for (const candidate of imageCompressionCandidates()) {
      const outputImage = join(
        workspace,
        `provider-photo-${candidate.maxDimension}-${candidate.quality}.jpg`
      );

      await execFileAsync(ffmpegBin, [
        "-y",
        "-i",
        inputImage,
        "-vf",
        `scale=w='if(gte(iw,ih),min(iw,${candidate.maxDimension}),-2)':h='if(gte(iw,ih),-2,min(ih,${candidate.maxDimension}))'`,
        "-frames:v",
        "1",
        "-q:v",
        String(candidate.quality),
        outputImage
      ]);

      const outputBytes = await readFile(outputImage);

      if (outputBytes.byteLength <= falTargetImageUploadBytes) {
        return new File([outputBytes], replaceImageExtension(name, "jpg"), {
          type: "image/jpeg"
        });
      }
    }

    throw new Error(
      `Compressed photo still exceeds fal.ai's ${falMaxUploadBytes}-byte upload limit.`
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function imageCompressionCandidates() {
  return [
    { maxDimension: 2048, quality: 4 },
    { maxDimension: 1600, quality: 5 },
    { maxDimension: 1280, quality: 6 },
    { maxDimension: 960, quality: 7 },
    { maxDimension: 720, quality: 8 }
  ];
}

function extensionForMimeType(mime: string) {
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpg";
  }

  if (mime.includes("webp")) {
    return "webp";
  }

  return "png";
}

function replaceImageExtension(name: string, extension = "png") {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  return `${base || "photo"}.${extension}`;
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
