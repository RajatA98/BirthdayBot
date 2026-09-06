import { traceTool } from "@/lib/langfuse";
import { getOccasionConfig, occasionFromDraft } from "@/lib/occasions";
import { DraftRequest, JobRecord, PlanRecord } from "@/lib/types";
import { getServerEnv } from "@/lib/server-env";

const elevenLabsBaseUrl = "https://api.elevenlabs.io/v1";
// v3 is ElevenLabs' most emotionally expressive model and supports inline
// audio tags like [warmly] / [whispers]. Higher latency than v2 but our
// pipeline is offline (mux happens after fal completes) so the TTFB cost
// is irrelevant. Override with ELEVENLABS_TTS_MODEL if needed.
const defaultElevenLabsTtsModel = "eleven_v3";
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
  // Retry of an existing job that already produced audio: return cached.
  // We only short-circuit on actual audio (or a recorded error), not on
  // a bare voice_id — a fresh generation needs to re-do TTS even if the
  // clone is reusable.
  if (job.voiceOverUrl || job.voiceOverError) {
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
  const text = birthdayVoiceOverText(planRecord.caption, draft);
  const hasSample = Boolean(draft.voiceSampleDataUrl || draft.voiceSampleClips?.length);
  const hasConsent = Boolean(draft.voiceConsent);
  const isSpeakYourself =
    draft.voiceMode === "speak-yourself" && Boolean(draft.userMessageDataUrl);
  // Voice clones persist across generations within a session — when the
  // client passes a previously-minted voice_id back, skip the IVC step.
  const cachedVoiceId = job.providerVoiceId;

  // Speak-yourself mode: the user recorded their actual birthday message in
  // their own voice. We route it through ElevenLabs Voice Changer (S2S) so
  // the *output* sounds polished but their prosody, timing, laughs, and
  // emotional delivery are preserved verbatim — TTS-from-script can never
  // do that.
  let voiceCloneFailureMessage: string | undefined;

  if (isSpeakYourself && (hasSample || cachedVoiceId) && hasConsent) {
    try {
      const { voiceId, output: voiceOverUrl } = await withClonedVoice(
        cachedVoiceId,
        draft,
        apiKey,
        (id) =>
          createElevenLabsSpeechToSpeech(
            id,
            draft.userMessageDataUrl as string,
            apiKey
          )
      );

      draft.voiceSampleName = undefined;
      draft.voiceSampleDataUrl = undefined;
      draft.voiceSampleClips = undefined;
      draft.voiceConsent = undefined;
      draft.userMessageDataUrl = undefined;

      return {
        providerVoiceId: voiceId,
        voiceOverUrl
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        "[birthdaybot:voice_clone] speech-to-speech failed, falling back to stock voice:",
        detail
      );
      voiceCloneFailureMessage = `Voice Changer (speech-to-speech) failed — fell back to a stock narrator voice. Reason: ${truncate(detail, 200)}`;
      // fall through to stock-voice fallback (will be TTS, not S2S)
    }
  }

  // Try the user's cloned voice first — only if they uploaded a sample AND
  // explicitly confirmed cloning consent. Without consent we never upload
  // their voice, but we still narrate using a stock voice.
  if ((hasSample || cachedVoiceId) && hasConsent) {
    try {
      const { voiceId, output: voiceOverUrl } = await withClonedVoice(
        cachedVoiceId,
        draft,
        apiKey,
        (id) =>
          createElevenLabsSpeech(
            id,
            addAudioTag(text, planRecord.plan.narrationVoiceCue),
            apiKey,
            {
              // v3 baseline tuned for emotional birthday narration (per
              // ElevenLabs TTS playground docs).
              stability: 0.45,
              similarity_boost: 0.75,
              style: 0,
              use_speaker_boost: false
            }
          )
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
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        "[birthdaybot:voice_clone] cloning failed, falling back to stock voice:",
        detail
      );
      // Surface to UI so users don't think their voice was used when it
      // wasn't. Common causes: free-tier IVC not enabled on the account,
      // sample shorter than ElevenLabs' minimum, audio format rejected.
      voiceCloneFailureMessage = `Voice cloning failed — we narrated with a stock voice instead. Reason: ${truncate(detail, 200)}`;
      // fall through to stock-voice fallback
    }
  }

  // Stock-voice fallback: prompt-aware voice selection so a mariachi
  // birthday gets a warm Latin-leaning voice, a soft cinematic one gets
  // a tender voice, etc. Caption text stays as-is — translation is a
  // separate enhancement.
  //
  // Resolution order, first hit wins:
  //   1. ELEVENLABS_STOCK_VOICE_ID env override (force a specific voice)
  //   2. The agent plan's narrationVoiceCue, mapped through the cue picker
  //      (cultural accents look up env-configured voice IDs first; English
  //      vibes fall through to the default catalog).
  //   3. Legacy keyword pattern matching against the prompt + plan body.
  //   4. Default: Rachel.
  const stockVoiceId =
    getServerEnv("ELEVENLABS_STOCK_VOICE_ID") ||
    pickStockVoiceFromCue(planRecord.plan.narrationVoiceCue) ||
    pickStockVoice(planRecord) ||
    defaultStockVoiceId;

  try {
    const voiceOverUrl = await createElevenLabsSpeech(
      stockVoiceId,
      addAudioTag(text, planRecord.plan.narrationVoiceCue),
      apiKey,
      {
        stability: 0.5,
        similarity_boost: 0.7,
        style: 0,
        use_speaker_boost: false
      }
    );
    return {
      voiceOverUrl,
      // If we got here AFTER a clone attempt failed, surface that to the
      // UI so the user knows the stock voice is a fallback (not their
      // clone). Without this signal the output sounds generic for
      // mysterious reasons — exactly the "is the clone hooked up?"
      // question that brought us here.
      voiceOverError: voiceCloneFailureMessage
    };
  } catch (error) {
    return {
      voiceOverError:
        error instanceof Error
          ? error.message
          : "ElevenLabs voice-over generation failed."
    };
  }
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
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

// Cultural accent voice slots. The default ElevenLabs voice library is
// English-American leaning, so for authentic non-English accents the user
// must add voices from the EL voice library to their account and set the
// matching env var. When the env var is unset, this returns undefined and
// we fall through to the keyword catalog or the default voice.
const culturalCueMap: Array<{
  match: RegExp;
  envVar: string;
  fallbackId?: string;
  label: string;
}> = [
  // Spanish / Latin / mariachi → Antoni is a reasonable EN-AM fallback;
  // an EL Spanish-native voice via env beats it.
  {
    match: /(spanish|latino|latina|hispanic|mariachi|salsa|tango|cumbia|fiesta|flamenco|reggaet[oó]n|espa[nñ]ol)/i,
    envVar: "ELEVENLABS_VOICE_SPANISH",
    fallbackId: "ErXwobaYiN019PkySvjV", // Antoni
    label: "Spanish/Latin"
  },
  // Indian / Punjabi / Bollywood / bhangra
  {
    match: /(indian|punjabi|hindi|bhangra|bollywood|hindustani|desi|sanskrit)/i,
    envVar: "ELEVENLABS_VOICE_INDIAN",
    label: "Indian/Punjabi"
  },
  // Korean / K-pop
  {
    match: /(korean|kpop|k-pop|hallyu|hangul)/i,
    envVar: "ELEVENLABS_VOICE_KOREAN",
    label: "Korean"
  },
  // Japanese / J-pop / anime
  {
    match: /(japanese|jpop|j-pop|anime|nihon|tokyo)/i,
    envVar: "ELEVENLABS_VOICE_JAPANESE",
    label: "Japanese"
  },
  // African / Afrobeat / Amapiano
  {
    match: /(african|afrobeat|amapiano|swahili|nigerian|ghanaian|kenyan|south african)/i,
    envVar: "ELEVENLABS_VOICE_AFRICAN",
    label: "African"
  },
  // Arabic / Middle Eastern
  {
    match: /(arabic|persian|farsi|middle east|arab|levantine|maghreb)/i,
    envVar: "ELEVENLABS_VOICE_ARABIC",
    label: "Arabic/Persian"
  },
  // Mandarin / Cantonese
  {
    match: /(mandarin|cantonese|chinese|guangzhou|beijing|shanghai)/i,
    envVar: "ELEVENLABS_VOICE_MANDARIN",
    label: "Mandarin/Cantonese"
  },
  // Built-in non-American English accents available in the default catalog:
  {
    match: /(british|english accent|posh|royal|cockney|london)/i,
    envVar: "ELEVENLABS_VOICE_BRITISH",
    fallbackId: "JBFqnCBsd6RMkjVDRZzb", // George
    label: "British"
  },
  {
    match: /(australian|aussie)/i,
    envVar: "ELEVENLABS_VOICE_AUSTRALIAN",
    fallbackId: "IKne3meq5aSn9XLyUdCD", // Charlie
    label: "Australian"
  }
];

// Vibe cues that don't carry a cultural accent — pick by gender + tone
// from the default English-American catalog.
const vibeCueMap: Array<{ match: RegExp; voiceId: string; label: string }> = [
  {
    match: /(soft|tender|intimate|whisper|gentle|cozy|sweet)/i,
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    label: "Bella"
  },
  {
    match: /(emotional|youthful female|young female|teen female)/i,
    voiceId: "MF3mGyEYCl7XYWbV9V6O",
    label: "Elli"
  },
  {
    match: /(deep|narrative|cinematic|grand|sweeping|trailer|epic|dramatic)/i,
    voiceId: "pNInz6obpgDQGcFmaJgB",
    label: "Adam"
  },
  {
    match: /(playful|festive|hype|excited|exciting|party|wild|crazy|lively|disco|confident female)/i,
    voiceId: "AZnzlk1XvdvUeBnXmlld",
    label: "Domi"
  },
  {
    match: /(deep male|young male|raspy)/i,
    voiceId: "yoZ06aMxZJJ28mfd3POQ",
    label: "Sam"
  }
];

export function pickStockVoiceFromCue(cue?: string): string | undefined {
  if (!cue) return undefined;
  const lower = cue.toLowerCase();

  for (const entry of culturalCueMap) {
    if (entry.match.test(lower)) {
      const fromEnv = getServerEnv(entry.envVar);
      if (fromEnv) return fromEnv;
      if (entry.fallbackId) return entry.fallbackId;
      // Cultural cue matched but no voice configured — fall through to
      // the vibe layer so we still pick something tonally close.
      break;
    }
  }

  for (const entry of vibeCueMap) {
    if (entry.match.test(lower)) {
      return entry.voiceId;
    }
  }

  return undefined;
}

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

// Clones are minted lazily and then reused via the voice_id the client
// caches and passes back. Two things still eat the account's voice slots:
// a browser that loses its cached id mints a fresh clone, and clones from
// earlier sessions were never reclaimed. ElevenLabs caps custom voices per
// plan, so without reclamation the account eventually drifts into
// voice_limit_reached and *every* future clone fails.
const clonedVoiceNamePrefix = "BirthdayBot voice ";
// How many of our own clones survive a reclaim. Keeping more than one
// tolerates concurrent generations racing to mint.
const maxRetainedClonedVoices = 2;

function clonedVoiceMintedAt(name?: string) {
  const parsed = Number(name?.slice(clonedVoiceNamePrefix.length));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Delete clones this app minted in earlier sessions, keeping the newest
// `keep`. Deliberately matched on our own name prefix and category so we
// can never remove a voice the user added to their own library.
// Best-effort: reclaiming is an optimisation, never a precondition, so a
// failure here must not block the generation.
async function reclaimVoiceSlots(apiKey: string, keep: number) {
  try {
    const response = await fetch(`${elevenLabsBaseUrl}/voices`, {
      headers: { "xi-api-key": apiKey }
    });

    if (!response.ok) return;

    const body = (await response.json()) as {
      voices?: Array<{ voice_id?: string; name?: string; category?: string }>;
    };

    const ours = (body.voices || [])
      .filter(
        (voice): voice is { voice_id: string; name: string; category: string } =>
          voice.category === "cloned" &&
          typeof voice.voice_id === "string" &&
          Boolean(voice.name?.startsWith(clonedVoiceNamePrefix))
      )
      // Names carry the mint timestamp, so this puts the newest first and
      // leaves the stale ones in the tail we delete.
      .sort((a, b) => clonedVoiceMintedAt(b.name) - clonedVoiceMintedAt(a.name));

    for (const voice of ours.slice(Math.max(keep, 0))) {
      await deleteElevenLabsVoice(voice.voice_id, apiKey);
    }
  } catch {
    // Non-fatal — fall through and let the mint attempt proceed.
  }
}

// ElevenLabs rejects a clone once the plan's voice slots are full. That is
// the failure the leak produces, and it is recoverable: our own stale
// clones are exactly what's occupying the slots. Deliberately narrow, so
// an unrelated failure (a lapsed plan, a rejected sample) never deletes
// voices — it just falls through to the stock narrator as before.
function isVoiceLimitError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return /voice_limit|maximum amount of custom voices/i.test(detail);
}

// Reclaim lazily rather than before every mint: the happy path stays a
// single API call, and we only pay for the listing when we actually hit
// the ceiling.
async function mintClonedVoice(draft: DraftRequest, apiKey: string) {
  try {
    return await createElevenLabsVoice(draft, apiKey);
  } catch (error) {
    if (!isVoiceLimitError(error)) throw error;

    console.warn(
      "[birthdaybot:voice_clone] voice slots full, reclaiming stale BirthdayBot clones"
    );
    await reclaimVoiceSlots(apiKey, maxRetainedClonedVoices);
    return createElevenLabsVoice(draft, apiKey);
  }
}

// A 404 voice_not_found means the cached id outlived the clone it pointed
// at (reclaimed above, or deleted from the ElevenLabs dashboard). That is
// recoverable — we still hold the sample. Deliberately narrow: a plan
// lapse answers 401 ivc_not_permitted, and re-cloning that would just
// fail again.
function isVoiceNotFoundError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return /voice_not_found/i.test(detail);
}

// Runs `speak` with the user's cloned voice, minting one if we don't have
// it yet. If a cached voice_id turns out to be dead, re-mint from the
// sample we still hold and retry once, rather than silently dropping the
// user to a stock narrator — that fallback is what makes a clone failure
// look like "the app just ignored my voice".
async function withClonedVoice<T>(
  cachedVoiceId: string | undefined,
  draft: DraftRequest,
  apiKey: string,
  speak: (voiceId: string) => Promise<T>
): Promise<{ voiceId: string; output: T }> {
  if (!cachedVoiceId) {
    const voiceId = await mintClonedVoice(draft, apiKey);
    return { voiceId, output: await speak(voiceId) };
  }

  try {
    return { voiceId: cachedVoiceId, output: await speak(cachedVoiceId) };
  } catch (error) {
    if (!isVoiceNotFoundError(error) || collectVoiceSamples(draft).length === 0) {
      throw error;
    }

    console.warn(
      "[birthdaybot:voice_clone] cached voice is gone, re-cloning from the stored sample:",
      cachedVoiceId
    );

    const voiceId = await mintClonedVoice(draft, apiKey);
    return { voiceId, output: await speak(voiceId) };
  }
}

async function createElevenLabsVoice(draft: DraftRequest, apiKey: string) {
  const form = new FormData();
  const samples = collectVoiceSamples(draft);

  form.append("name", `${clonedVoiceNamePrefix}${Date.now()}`);
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

async function createElevenLabsSpeechToSpeech(
  voiceId: string,
  sourceAudioDataUrl: string,
  apiKey: string
) {
  const sourceFile = dataUrlToBlob(sourceAudioDataUrl, "user-message.webm");
  const form = new FormData();
  form.append("audio", sourceFile);
  form.append(
    "model_id",
    getServerEnv("ELEVENLABS_STS_MODEL") || "eleven_multilingual_sts_v2"
  );
  form.append(
    "voice_settings",
    JSON.stringify({
      stability: 0.5,
      similarity_boost: 0.85,
      style: 0,
      use_speaker_boost: true
    })
  );
  form.append("remove_background_noise", "true");

  const response = await fetch(
    `${elevenLabsBaseUrl}/speech-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form
    }
  );

  if (!response.ok) {
    throw new Error(
      await providerErrorMessage(response, "ElevenLabs Voice Changer failed.")
    );
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

// Map a narrationVoiceCue (e.g. "warm Punjabi-accented male, mid-energy")
// to a single ElevenLabs v3 audio tag prepended to the script. v3 silently
// drops unknown tags so this fails safe. Tag list per ElevenLabs help:
// https://help.elevenlabs.io/hc/en-us/articles/35869142561297
const audioTagCatalog: Array<{ match: RegExp; tag: string }> = [
  {
    match: /(tender|intimate|soft|whisper|gentle|cozy|sweet|loving|warm)/i,
    tag: "[warmly]"
  },
  {
    match: /(festive|excited|exciting|playful|hype|party|fun|wild|crazy|lively|disco)/i,
    tag: "[excited]"
  },
  {
    match: /(cinematic|epic|dramatic|grand|sweeping|trailer|noir|saga)/i,
    tag: "[reverently]"
  },
  {
    match: /(funny|witty|humor|chuckle|laugh|joke|comedic)/i,
    tag: "[chuckles]"
  }
];

export function addAudioTag(text: string, cue?: string): string {
  if (!cue) return text;
  for (const entry of audioTagCatalog) {
    if (entry.match.test(cue)) {
      return `${entry.tag} ${text}`;
    }
  }
  return text;
}

function birthdayVoiceOverText(caption: string, draft: DraftRequest) {
  const occasion = getOccasionConfig(occasionFromDraft(draft));
  const fallback = occasionFallbackVoiceOver(occasion.id);
  const cleaned = cleanNarrationScript(caption || fallback, occasion);
  const limited = limitVoiceOverWords(cleaned);

  if (limited.length <= 260) {
    return limited;
  }

  return limited.slice(0, 257).trim();
}

function occasionFallbackVoiceOver(id: ReturnType<typeof getOccasionConfig>["id"]) {
  if (id === "mothers-day") {
    return "Happy Mother's Day. Thank you for everything — today and every day.";
  }
  if (id === "birthday") {
    return "Happy birthday. I hope today makes you feel celebrated and loved.";
  }
  // General fallback: a neutral message that doesn't lead with "Happy ___".
  return "Hey — just wanted to send something a little better than a text. Thinking of you.";
}

function cleanNarrationScript(
  script: string,
  occasion: ReturnType<typeof getOccasionConfig>
) {
  const cleaned = script
    .replace(/\s+/g, " ")
    .replaceAll('"', "'")
    .replace(/^\s*(?:voice[\s-]?over|narration|script|caption)\s*:\s*/i, "")
    .replace(/^\s*(?:um+|uh+|ah+|erm+|hmm+|okay|ok|testing|test|one two(?: three)?)[,.\s-]+/i, "")
    .replace(/\.+$/g, ".")
    .trim();

  // Trim filler before the actual greeting. For seasoned occasions we look
  // for the holiday greeting (e.g. "happy mother's day", "happy birthday")
  // and slice from there. For the generic "Just a message" occasion there's
  // no expected greeting to anchor on, so we keep the cleaned text as-is.
  if (occasion.id !== "general") {
    const greetingPattern =
      occasion.id === "mothers-day"
        ? /\bhappy\s+mother(?:'|’)?s?\s+day\b/i
        : /\bhappy birthday\b/i;
    const greetingStart = cleaned.search(greetingPattern);

    if (greetingStart > 0 && greetingStart <= 90) {
      return cleaned.slice(greetingStart).trim();
    }
  }

  if (cleaned) return cleaned;

  return occasionFallbackVoiceOver(occasion.id);
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
