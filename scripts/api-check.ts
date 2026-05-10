// Standalone connectivity / capability check for the providers BirthdayBot
// uses. Reads env from .env via @next/env. Run with:
//   npx tsx scripts/api-check.ts

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const elKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
const falKey = process.env.FAL_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

type Status = "ok" | "fail" | "skip";
const lines: Array<{ name: string; status: Status; detail: string }> = [];

function record(name: string, status: Status, detail: string) {
  lines.push({ name, status, detail });
  const icon = status === "ok" ? "✓" : status === "fail" ? "✗" : "·";
  const color =
    status === "ok" ? "\x1b[32m" : status === "fail" ? "\x1b[31m" : "\x1b[33m";
  console.log(`${color}${icon}\x1b[0m ${name.padEnd(40, " ")} ${detail}`);
}

async function checkElevenLabsAccount() {
  if (!elKey) return record("ElevenLabs / account", "skip", "no ELEVENLABS_API_KEY");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": elKey }
    });
    if (!res.ok) {
      const body = await res.text();
      return record(
        "ElevenLabs / account",
        "fail",
        `${res.status} ${body.slice(0, 160)}`
      );
    }
    const json = (await res.json()) as {
      subscription?: {
        tier?: string;
        character_count?: number;
        character_limit?: number;
        can_extend_voice_limit?: boolean;
        voice_limit?: number;
        professional_voice_limit?: number;
        can_use_instant_voice_cloning?: boolean;
        can_use_professional_voice_cloning?: boolean;
        currency?: string;
        status?: string;
      };
      xi_api_key?: string;
    };
    const sub = json.subscription;
    record(
      "ElevenLabs / account",
      "ok",
      `tier=${sub?.tier || "?"} chars=${sub?.character_count || 0}/${
        sub?.character_limit || "?"
      } IVC=${sub?.can_use_instant_voice_cloning ? "yes" : "no"} status=${sub?.status || "?"}`
    );
  } catch (error) {
    record(
      "ElevenLabs / account",
      "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkElevenLabsTts() {
  if (!elKey) return record("ElevenLabs / TTS (stock voice)", "skip", "no key");
  try {
    const stockVoiceId =
      process.env.ELEVENLABS_STOCK_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${stockVoiceId}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elKey
        },
        body: JSON.stringify({
          text: "Test.",
          model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.7,
            style: 0.2,
            use_speaker_boost: true
          }
        })
      }
    );
    if (!res.ok) {
      const body = await res.text();
      return record(
        "ElevenLabs / TTS (stock voice)",
        "fail",
        `${res.status} ${body.slice(0, 200)}`
      );
    }
    const bytes = await res.arrayBuffer();
    record(
      "ElevenLabs / TTS (stock voice)",
      "ok",
      `received ${bytes.byteLength} bytes mp3`
    );
  } catch (error) {
    record(
      "ElevenLabs / TTS (stock voice)",
      "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkElevenLabsIvc() {
  if (!elKey) return record("ElevenLabs / IVC capability", "skip", "no key");
  try {
    // We can't easily test the full /voices/add without a real audio file,
    // but we CAN check the voices listing which returns 401/403 with a
    // tier-related error if cloning is gated, and 200 with the user's
    // existing voices if it's available.
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": elKey }
    });
    if (!res.ok) {
      const body = await res.text();
      return record(
        "ElevenLabs / IVC capability",
        "fail",
        `${res.status} ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as {
      voices?: Array<{ voice_id: string; name: string; category?: string }>;
    };
    const voices = json.voices || [];
    const cloned = voices.filter((v) => v.category === "cloned");
    const generated = voices.filter((v) => v.category === "generated");
    const premade = voices.filter((v) => v.category === "premade");
    record(
      "ElevenLabs / IVC capability",
      "ok",
      `library has ${voices.length} voices (premade=${premade.length}, cloned=${cloned.length}, generated=${generated.length})`
    );
  } catch (error) {
    record(
      "ElevenLabs / IVC capability",
      "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkElevenLabsMusic() {
  if (!elKey) return record("ElevenLabs / Music API", "skip", "no key");
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elKey
        },
        body: JSON.stringify({
          prompt: "warm uplifting birthday party music bed, instrumental",
          model_id: "music_v1",
          music_length_ms: 3000,
          force_instrumental: true
        })
      }
    );
    if (!res.ok) {
      const body = await res.text();
      return record(
        "ElevenLabs / Music API",
        "fail",
        `${res.status} ${body.slice(0, 220)}`
      );
    }
    const bytes = await res.arrayBuffer();
    record(
      "ElevenLabs / Music API",
      "ok",
      `received ${bytes.byteLength} bytes mp3`
    );
  } catch (error) {
    record(
      "ElevenLabs / Music API",
      "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkOpenAi() {
  if (!openAiKey) return record("OpenAI / Responses API", "skip", "no OPENAI_API_KEY");
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini",
        input: "Say the literal string OK and nothing else.",
        max_output_tokens: 16
      })
    });
    if (!res.ok) {
      const body = await res.text();
      return record(
        "OpenAI / Responses API",
        "fail",
        `${res.status} ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as { output_text?: string };
    record(
      "OpenAI / Responses API",
      "ok",
      `model=${process.env.OPENAI_PLAN_MODEL || "gpt-4.1-mini"} reply=${(json.output_text || "").slice(0, 40)}`
    );
  } catch (error) {
    record(
      "OpenAI / Responses API",
      "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkFal() {
  if (!falKey) return record("fal / queue.submit", "skip", "no FAL_KEY");
  try {
    // Check the queue endpoint with the configured model. We don't expect
    // a real generation here — we just want to know if the key is accepted
    // and the model is reachable. Using a 1-second submit and not awaiting
    // the result keeps cost minimal.
    const endpoint =
      process.env.FAL_VIDEO_MODEL ||
      "fal-ai/kling-video/v3/standard/image-to-video";
    const res = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${falKey}`
      },
      body: JSON.stringify({
        prompt: "test",
        image_url: "https://placehold.co/512x512.png",
        duration: "5",
        aspect_ratio: "16:9"
      })
    });
    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      return record("fal / queue.submit", "fail", `${res.status} ${body.slice(0, 200)}`);
    }
    if (!res.ok) {
      const body = await res.text();
      return record(
        "fal / queue.submit",
        "fail",
        `${res.status} ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as { request_id?: string };
    record(
      "fal / queue.submit",
      "ok",
      `endpoint=${endpoint} request_id=${json.request_id || "(no id)"}`
    );
  } catch (error) {
    record(
      "fal / queue.submit",
      error instanceof Error ? "fail" : "fail",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function main() {
  console.log("BirthdayBot provider connectivity check");
  console.log("=========================================");
  console.log(
    `ELEVENLABS_API_KEY: ${elKey ? `set (${elKey.slice(0, 6)}...${elKey.slice(-4)})` : "MISSING"}`
  );
  console.log(
    `FAL_KEY:            ${falKey ? `set (${falKey.slice(0, 6)}...${falKey.slice(-4)})` : "MISSING"}`
  );
  console.log(
    `OPENAI_API_KEY:     ${openAiKey ? `set (${openAiKey.slice(0, 6)}...${openAiKey.slice(-4)})` : "MISSING"}`
  );
  console.log("");

  await checkElevenLabsAccount();
  await checkElevenLabsTts();
  await checkElevenLabsIvc();
  await checkElevenLabsMusic();
  await checkOpenAi();
  await checkFal();

  const failures = lines.filter((l) => l.status === "fail");
  console.log("");
  if (failures.length === 0) {
    console.log("\x1b[32mAll checks passed.\x1b[0m");
  } else {
    console.log(`\x1b[31m${failures.length} check(s) failed.\x1b[0m`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
