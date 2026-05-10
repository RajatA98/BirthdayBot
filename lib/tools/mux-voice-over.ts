import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { fal } from "@fal-ai/client";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export async function muxVoiceOverIntoVideo(videoUrl: string, voiceOverUrl: string) {
  const ffmpegPath = getFfmpegPath();

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

function getFfmpegPath() {
  try {
    const moduleName = ["ffmpeg", "-static"].join("");
    return require(moduleName) as string | undefined;
  } catch {
    return undefined;
  }
}
