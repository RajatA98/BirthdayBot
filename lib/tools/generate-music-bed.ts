import { traceTool } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import { DraftRequest, PlanRecord } from "@/lib/types";

const elevenLabsMusicUrl = "https://api.elevenlabs.io/v1/music";
const minMusicLengthMs = 3_000;
const maxMusicLengthMs = 30_000;

export async function generateAiMusicBed(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  durationSeconds: number
): Promise<Buffer | undefined> {
  return traceTool(
    "music-bed",
    () => generateAiMusicBedInner(draft, plan, durationSeconds),
    {
      metadata: {
        durationSeconds,
        musicVibe: draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting"
      },
      extractOutput: (result) => ({
        outcome: result ? "ready" : "skipped",
        bytes: result?.byteLength
      })
    }
  );
}

async function generateAiMusicBedInner(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  durationSeconds: number
): Promise<Buffer | undefined> {
  if (!isAiMusicEnabled()) {
    return undefined;
  }

  const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");

  if (!apiKey) {
    return undefined;
  }

  const prompt = buildMusicPrompt(draft, plan);
  const musicLengthMs = Math.min(
    Math.max(Math.round(durationSeconds * 1000), minMusicLengthMs),
    maxMusicLengthMs
  );

  try {
    const response = await fetch(
      `${elevenLabsMusicUrl}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          prompt,
          model_id: "music_v1",
          music_length_ms: musicLengthMs,
          force_instrumental: true
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        "[birthdaybot:generate_music_bed] ElevenLabs music failed",
        response.status,
        detail.slice(0, 200)
      );
      return undefined;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[birthdaybot:generate_music_bed] Error", error);
    return undefined;
  }
}

function isAiMusicEnabled() {
  const explicit = getServerEnv("USE_AI_MUSIC");

  if (explicit === "true") return true;
  if (explicit === "false") return false;

  return Boolean(
    getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY")
  );
}

function buildMusicPrompt(draft: DraftRequest, plan: PlanRecord["plan"]) {
  const vibe =
    draft.mode === "advanced" ? draft.advanced.musicVibe : "Uplifting";
  const scene =
    plan.sceneDirection || plan.concept || "warm birthday celebration";
  const motion =
    draft.mode === "advanced" ? draft.advanced.motionIntensity : "Moderate";

  return [
    `${vibe.toLowerCase()} birthday party music bed.`,
    `Scene context: ${scene}.`,
    `Energy level: ${motion.toLowerCase()}.`,
    "Instrumental only, no vocals or lyrics.",
    "Warm, celebratory, with light percussion and a gentle melodic hook.",
    "Mixed to sit under a spoken voice-over without overpowering it.",
    "Avoid abrupt drops, sudden silences, or jarring transitions."
  ].join(" ");
}
