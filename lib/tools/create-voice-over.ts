import { traceTool } from "@/lib/langfuse";
import { DraftRequest, JobRecord, PlanRecord } from "@/lib/types";
import { getServerEnv } from "@/lib/server-env";

const elevenLabsBaseUrl = "https://api.elevenlabs.io/v1";
const defaultElevenLabsTtsModel = "eleven_multilingual_v2";
// Rachel — warm, neutral, clear narrator voice; works well for birthday
// content. Override with ELEVENLABS_STOCK_VOICE_ID env var if needed.
const defaultStockVoiceId = "21m00Tcm4TlvDq8ikWAM";

export type VoiceOverResult = {
  providerVoiceId?: string;
  voiceOverUrl?: string;
  voiceOverError?: string;
};

export async function createVoiceOver(
  planRecord: PlanRecord,
  job: JobRecord
): Promise<VoiceOverResult> {
  return traceTool(
    "voice-cloning",
    () => createVoiceOverInner(planRecord, job),
    {
      requestId: job.requestId,
      metadata: {
        hasSample: Boolean(planRecord.draft.voiceSampleDataUrl),
        hasConsent: Boolean(planRecord.draft.voiceConsent)
      },
      extractOutput: (result) => ({
        outcome: result.voiceOverError
          ? "error"
          : result.voiceOverUrl
            ? "ready"
            : "skipped",
        hasVoiceId: Boolean(result.providerVoiceId)
      })
    }
  );
}

async function createVoiceOverInner(
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

  const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");

  if (!apiKey) {
    return {
      voiceOverError:
        "ELEVENLABS_API_KEY is required to generate a voice-over."
    };
  }

  const draft = planRecord.draft;
  const text = birthdayVoiceOverText(planRecord.caption);
  const hasSample = Boolean(draft.voiceSampleDataUrl || draft.voiceSampleClips?.length);
  const hasConsent = Boolean(draft.voiceConsent);

  // Try the user's cloned voice first — only if they uploaded a sample AND
  // explicitly confirmed cloning consent. Without consent we never upload
  // their voice, but we still narrate using a stock voice.
  if (hasSample && hasConsent) {
    let voiceId: string | undefined;
    try {
      voiceId = await createElevenLabsVoice(draft, apiKey);
      const voiceOverUrl = await createElevenLabsSpeech(
        voiceId,
        text,
        apiKey,
        {
          stability: 0.48,
          similarity_boost: 0.86,
          style: 0.12,
          use_speaker_boost: true
        }
      );

      draft.voiceSampleName = undefined;
      draft.voiceSampleDataUrl = undefined;
      draft.voiceSampleClips = undefined;
      draft.voiceConsent = undefined;

      return {
        providerVoiceId: voiceId,
        voiceOverUrl
      };
    } catch (error) {
      console.warn(
        "[birthdaybot:voice_clone] cloning failed, falling back to stock voice:",
        error instanceof Error ? error.message : error
      );
      // fall through to stock-voice fallback
    } finally {
      if (voiceId) {
        await deleteElevenLabsVoice(voiceId, apiKey);
      }
    }
  }

  // Stock-voice fallback: prompt-aware voice selection so a mariachi
  // birthday gets a warm Latin-leaning voice, a soft cinematic one gets
  // a tender voice, etc. Caption text stays as-is — translation is a
  // separate enhancement.
  const stockVoiceId =
    getServerEnv("ELEVENLABS_STOCK_VOICE_ID") ||
    pickStockVoice(planRecord) ||
    defaultStockVoiceId;

  try {
    const voiceOverUrl = await createElevenLabsSpeech(
      stockVoiceId,
      text,
      apiKey,
      {
        stability: 0.55,
        similarity_boost: 0.7,
        style: 0.2,
        use_speaker_boost: true
      }
    );
    return { voiceOverUrl };
  } catch (error) {
    return {
      voiceOverError:
        error instanceof Error
          ? error.message
          : "ElevenLabs voice-over generation failed."
    };
  }
}

type StockVoice = {
  id: string;
  match: RegExp;
  name: string;
};

const stockVoiceCatalog: StockVoice[] = [
  // Mariachi / fiesta / Latin → Antoni (warm, works well for Spanish phrasing)
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    match: /\b(mariachi|fiesta|salsa|tango|cumbia|espa[nñ]ol|spanish|latino|latina|flamenco|reggaet[oó]n)\b/i
  },
  // Soft / tender / intimate → Bella (soft young female)
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    match: /\b(tender|intimate|soft|whisper|quiet|gentle|serene|calm|cozy|sweet|loving)\b/i
  },
  // Playful / fun / party → Domi (confident young female)
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    match: /\b(playful|fun|party|hype|excited|exciting|festive|wild|crazy|lively|dance|disco)\b/i
  },
  // Cinematic / epic / dramatic → Adam (deep narrative voice)
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    match: /\b(cinematic|epic|dramatic|movie|trailer|grand|sweeping|hollywood|noir|saga)\b/i
  }
];

function pickStockVoice(planRecord: PlanRecord): string | undefined {
  const haystack = [
    planRecord.draft.prompt,
    planRecord.plan.title,
    planRecord.plan.concept,
    planRecord.plan.vibe,
    planRecord.plan.sceneDirection,
    planRecord.plan.surpriseFactor,
    planRecord.draft.advanced.tone,
    planRecord.draft.advanced.sceneIdea,
    planRecord.draft.advanced.musicVibe
  ]
    .filter(Boolean)
    .join(" ");

  for (const voice of stockVoiceCatalog) {
    if (voice.match.test(haystack)) {
      return voice.id;
    }
  }

  return undefined;
}

async function createElevenLabsVoice(draft: DraftRequest, apiKey: string) {
  const form = new FormData();
  const samples = collectVoiceSamples(draft);

  form.append("name", `BirthdayBot voice ${Date.now()}`);
  for (const sample of samples) {
    form.append("files", sample);
  }
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
  apiKey: string,
  voiceSettings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  }
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
        voice_settings: voiceSettings
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

function birthdayVoiceOverText(caption: string) {
  const fallback = "Happy birthday. I hope today makes you feel celebrated and loved.";
  const cleaned = cleanNarrationScript(caption || fallback);
  const limited = limitVoiceOverWords(cleaned);

  if (limited.length <= 260) {
    return limited;
  }

  return limited.slice(0, 257).trim();
}

function cleanNarrationScript(script: string) {
  const cleaned = script
    .replace(/\s+/g, " ")
    .replaceAll('"', "'")
    .replace(/^\s*(?:voice[\s-]?over|narration|script|caption)\s*:\s*/i, "")
    .replace(/^\s*(?:um+|uh+|ah+|erm+|hmm+|okay|ok|testing|test|one two(?: three)?)[,.\s-]+/i, "")
    .replace(/\.+$/g, ".")
    .trim();
  const birthdayStart = cleaned.search(/\bhappy birthday\b/i);

  if (birthdayStart > 0 && birthdayStart <= 90) {
    return cleaned.slice(birthdayStart).trim();
  }

  return cleaned || "Happy birthday. I hope today makes you feel celebrated and loved.";
}

function limitVoiceOverWords(text: string) {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= 34) {
    return text;
  }

  return words.slice(0, 34).join(" ");
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
  const mime = header.match(/data:(.*);base64/)?.[1] || "audio/webm";
  const bytes = Buffer.from(data, "base64");
  return new File([bytes], name, { type: mime });
}

function collectVoiceSamples(draft: DraftRequest) {
  const baseName = (draft.voiceSampleName || "voice-sample.webm").replace(
    /\.[^.]+$/,
    ""
  );
  const baseExt = extensionFromName(draft.voiceSampleName) || "webm";

  if (draft.voiceSampleClips && draft.voiceSampleClips.length) {
    return draft.voiceSampleClips
      .filter((dataUrl) => Boolean(dataUrl))
      .map((dataUrl, index) =>
        dataUrlToBlob(dataUrl, `${baseName}-take-${index + 1}.${baseExt}`)
      );
  }

  if (draft.voiceSampleDataUrl) {
    return [dataUrlToBlob(draft.voiceSampleDataUrl, `${baseName}.${baseExt}`)];
  }

  return [];
}

function extensionFromName(name?: string) {
  if (!name) return undefined;
  const match = name.match(/\.([^.]+)$/);
  return match?.[1];
}
