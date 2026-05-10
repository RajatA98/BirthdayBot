import { DraftRequest, JobRecord, PlanRecord } from "@/lib/types";
import { getServerEnv } from "@/lib/server-env";

const elevenLabsBaseUrl = "https://api.elevenlabs.io/v1";
const defaultElevenLabsTtsModel = "eleven_multilingual_v2";

export type VoiceOverResult = {
  providerVoiceId?: string;
  voiceOverUrl?: string;
  voiceOverError?: string;
};

export async function createVoiceOver(
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
