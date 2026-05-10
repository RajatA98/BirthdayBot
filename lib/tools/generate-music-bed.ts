import { traceTool } from "@/lib/langfuse";
import { getServerEnv } from "@/lib/server-env";
import { DraftRequest, PlanRecord } from "@/lib/types";

const elevenLabsMusicUrl = "https://api.elevenlabs.io/v1/music";
const minMusicLengthMs = 3_000;
const maxMusicLengthMs = 30_000;
const minSongLengthMs = 10_000;
const maxSongLengthMs = 30_000;

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

export async function generateBirthdaySong(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string,
  durationSeconds: number
): Promise<Buffer | undefined> {
  return traceTool(
    "birthday-song",
    () => generateBirthdaySongInner(draft, plan, caption, durationSeconds),
    {
      metadata: {
        durationSeconds,
        songStyle: draft.songStyle,
        birthdayName: draft.birthdayName
      },
      extractOutput: (result) => ({
        outcome: result ? "ready" : "skipped",
        bytes: result?.byteLength
      })
    }
  );
}

async function generateBirthdaySongInner(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string,
  durationSeconds: number
): Promise<Buffer | undefined> {
  const apiKey = getServerEnv("ELEVENLABS_API_KEY") || getServerEnv("XI_API_KEY");
  if (!apiKey) return undefined;

  const prompt = buildSongPrompt(draft, plan, caption);
  const songLengthMs = Math.min(
    Math.max(Math.round(durationSeconds * 1000), minSongLengthMs),
    maxSongLengthMs
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
          music_length_ms: songLengthMs,
          force_instrumental: false
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        "[birthdaybot:generate_birthday_song] ElevenLabs music failed",
        response.status,
        detail.slice(0, 200)
      );
      return undefined;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[birthdaybot:generate_birthday_song] Error", error);
    return undefined;
  }
}

function buildSongPrompt(
  draft: DraftRequest,
  plan: PlanRecord["plan"],
  caption: string
): string {
  const style = draft.songStyle || "Acoustic";
  const name = draft.birthdayName?.trim() || "the birthday person";
  const sceneVibe = plan.vibe || plan.concept || "warm celebration";

  const styleDirection: Record<string, string> = {
    Mariachi:
      "traditional mariachi band — trumpets, vihuela, guitarrón, palmas, festive Latin feel",
    Bhangra:
      "Punjabi bhangra — dhol drums, dholak, bright melody, high-energy dance feel",
    "Lo-fi":
      "lo-fi hip-hop — mellow piano, dusty drums, vinyl crackle, cozy late-night feel",
    Gospel: "gospel choir — soaring vocals, organ, warm harmonies, joyful celebration",
    "80s power ballad":
      "80s power ballad — soaring electric guitar, big drums, anthemic melody",
    Acoustic:
      "warm acoustic — fingerpicked guitar, gentle strings, intimate folk feel"
  };
  const styleNote = styleDirection[style] || styleDirection.Acoustic;

  return [
    `${style} birthday song celebrating ${name}.`,
    `Style: ${styleNote}.`,
    `Mood: ${sceneVibe.toLowerCase()}.`,
    "Sing 'Happy birthday' clearly in the lyrics; include the recipient's name.",
    `Suggested lyrics direction: ${caption.replace(/\s+/g, " ").trim()}`,
    "Keep it under 30 seconds, with a clear melody and a memorable hook."
  ].join(" ");
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
