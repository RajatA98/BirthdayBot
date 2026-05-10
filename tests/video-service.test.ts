const falClient = vi.hoisted(() => ({
  config: vi.fn(),
  upload: vi.fn(async () => "https://storage.example.com/photo.png"),
  submit: vi.fn(async () => ({ request_id: "fal_request_123" }))
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: falClient.config,
    storage: {
      upload: falClient.upload
    },
    queue: {
      submit: falClient.submit
    }
  }
}));

vi.mock("@/lib/tools/generate-music-bed", () => ({
  generateAiMusicBed: vi.fn(async () => undefined)
}));

vi.mock("@/lib/langfuse", () => ({
  getLangfuse: vi.fn(() => null),
  traceTool: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  emitTraceEvent: vi.fn()
}));

import {
  buildFalInput,
  buildFalPrompt,
  resolveJobStatus,
  startVideoGeneration
} from "@/lib/video-service";
import { DraftRequest, AgentPlan, JobRecord, PlanRecord } from "@/lib/types";

describe("buildFalPrompt", () => {
  it("uses the user prompt as the video direction and keeps the output birthday-focused", () => {
    const prompt = buildFalPrompt(
      makeDraft(),
      makePlan(),
      "Happy birthday to one of my favorite people."
    );

    expect(prompt).toContain("User video prompt: Make it a rooftop toast at sunset.");
    expect(prompt).toContain(
      "Treat the user video prompt as the main creative direction"
    );
    expect(prompt).toContain(
      "Embed tasteful subtle on-screen birthday text directly in the video frames"
    );
    expect(prompt).toContain("Happy birthday to one of my favorite people.");
    expect(prompt).toContain('warm "Happy Birthday!" title');
    expect(prompt).toContain("compact 2-3 sentence message");
    expect(prompt).toContain("gold, coral, and champagne gradient lettering");
    expect(prompt).toContain("Avoid plain white text.");
    expect(prompt).toContain("uplifting birthday music bed");
    expect(prompt).toContain("birthday celebration");
    expect(prompt).toContain("cake");
    expect(prompt).toContain("confetti");
    expect(prompt).toContain("Keep these cues from the photo: Faces; Clothing.");
  });

  it("passes advanced controls through to the video prompt", () => {
    const prompt = buildFalPrompt(
      {
        ...makeDraft(),
        mode: "advanced",
        advanced: {
          tone: "Funny",
          sceneIdea: "Dreamy surprise party",
          videoLength: "15 seconds",
          aspectRatio: "Landscape",
          captionStyle: "Bold",
          musicVibe: "Playful",
          motionIntensity: "Dramatic",
          agentGoalMode: "Surprise me"
        }
      },
      makePlan(),
      "Happy birthday, legend."
    );

    expect(prompt).toContain("Tone: Funny");
    expect(prompt).toContain("Scene idea: Dreamy surprise party");
    expect(prompt).toContain("Length target: 15 seconds");
    expect(prompt).toContain("Aspect ratio: Landscape");
    expect(prompt).toContain("Music vibe: Playful");
    expect(prompt).toContain("Motion intensity: Dramatic");
    expect(prompt).toContain("playful birthday music bed");
    expect(prompt).toContain("tasteful bold on-screen birthday text");
  });

  it("keeps generated video narration-free so ElevenLabs can provide the voice-over", () => {
    const prompt = buildFalPrompt(
      makeDraft({
        voiceSampleName: "rodolfo.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ=="
      }),
      makePlan(),
      "Happy birthday, legend. Hope today feels cinematic."
    );

    expect(prompt).toContain("Do not generate spoken narration");
    expect(prompt).toContain("user's cloned ElevenLabs narration will be muxed");
    expect(prompt).not.toContain("<<<voice_1>>>");
  });

  it("keeps a few caption sentences in the on-video text prompt", () => {
    const prompt = buildFalPrompt(
      makeDraft(),
      makePlan(),
      "Happy birthday, legend. I wanted this to feel more personal than a normal text. Hope your day feels cinematic. This extra sentence should stay out."
    );

    expect(prompt).toContain(
      "Happy birthday, legend. I wanted this to feel more personal than a normal text. Hope your day feels cinematic."
    );
    expect(prompt).not.toContain("This extra sentence should stay out.");
  });
});

describe("buildFalInput", () => {
  it("keeps the default endpoint compatible while adding video settings", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v2.1/standard/image-to-video",
      "https://example.com/photo.png",
      makeDraft(),
      makePlan(),
      "Happy birthday."
    );

    expect(input).toMatchObject({
      image_url: "https://example.com/photo.png",
      duration: "10",
      aspect_ratio: "9:16",
      cfg_scale: 0.65
    });
    expect(input).not.toHaveProperty("start_image_url");
    expect(input).not.toHaveProperty("generate_audio");
    expect(input.negative_prompt).toContain("misspelled text");
  });

  it("enables native audio for newer endpoints that support it", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v3/standard/image-to-video",
      "https://example.com/photo.png",
      {
        ...makeDraft(),
        mode: "advanced",
        advanced: {
          ...makeDraft().advanced,
          videoLength: "15 seconds",
          aspectRatio: "Landscape"
        }
      },
      makePlan(),
      "Happy birthday."
    );

    expect(input).toMatchObject({
      start_image_url: "https://example.com/photo.png",
      duration: "15",
      aspect_ratio: "16:9",
      generate_audio: true
    });
    expect(input).not.toHaveProperty("image_url");
  });

  it("does not ask Kling for audio or voice ids because ElevenLabs owns voice-over", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v2.6/pro/image-to-video",
      "https://example.com/photo.png",
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ=="
      }),
      makePlan(),
      "Happy birthday."
    );

    expect(input).toMatchObject({
      start_image_url: "https://example.com/photo.png"
    });
    expect(input).not.toHaveProperty("generate_audio");
    expect(input).not.toHaveProperty("voice_ids");
    expect(input.prompt).not.toContain("<<<voice_1>>>");
  });
});

describe("startVideoGeneration voice-over", () => {
  const originalFalKey = process.env.FAL_KEY;
  const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const originalUseAiMusic = process.env.USE_AI_MUSIC;

  beforeEach(() => {
    process.env.USE_AI_MUSIC = "false";
  });

  afterEach(() => {
    process.env.FAL_KEY = originalFalKey;
    process.env.ELEVENLABS_API_KEY = originalElevenLabsKey;
    process.env.USE_AI_MUSIC = originalUseAiMusic;
    falClient.config.mockClear();
    falClient.upload.mockClear();
    falClient.submit.mockClear();
    vi.unstubAllGlobals();
  });

  it("uses ElevenLabs once to clone the user voice sample and create voice-over audio", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voice_id: "eleven_voice_123",
            requires_verification: false
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
        voiceConsent: true
      })
    );
    const job = makeJob();

    const result = await startVideoGeneration(planRecord, job);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.elevenlabs.io/v1/voices/add"
    );
    const cloneBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(cloneBody).toBeInstanceOf(FormData);
    expect((cloneBody as FormData).getAll("files")).toHaveLength(1);
    expect((cloneBody as FormData).getAll("files[]")).toHaveLength(0);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/eleven_voice_123?output_format=mp3_44100_128"
    );
    const ttsBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof ttsBody).toBe("string");
    const ttsParsed = JSON.parse(String(ttsBody)) as {
      model_id: string;
      voice_settings: Record<string, number | boolean>;
      text: string;
    };
    expect(ttsParsed.model_id).toBe("eleven_v3");
    expect(ttsParsed.voice_settings).toEqual({
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: false
    });
    // narrationVoiceCue "warm American female, intimate" => [warmly] tag
    expect(ttsParsed.text.startsWith("[warmly]")).toBe(true);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.elevenlabs.io/v1/voices/eleven_voice_123"
    );
    expect(result.providerVoiceId).toBe("eleven_voice_123");
    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,AQID");
    expect(result.providerRequestId).toBe("fal_request_123");
    expect(falClient.submit).toHaveBeenCalledTimes(1);
    expect(planRecord.draft.voiceSampleDataUrl).toBeUndefined();
    expect(planRecord.draft.voiceConsent).toBeUndefined();
  });

  it("does not upload the voice sample to ElevenLabs IVC without consent, but still produces narration with a stock voice", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
        voiceConsent: false
      })
    );

    const result = await startVideoGeneration(planRecord, makeJob());

    // IVC voices/add must NOT be called - that is the consent guarantee.
    const ivcCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]).endsWith("/v1/voices/add")
    );
    expect(ivcCalls).toHaveLength(0);

    // Stock TTS must be called and the result has a voice-over URL.
    const ttsCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/v1/text-to-speech/")
    );
    expect(ttsCalls.length).toBeGreaterThan(0);
    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,AQID");
    expect(result.voiceOverError).toBeUndefined();
    expect(result.providerRequestId).toBe("fal_request_123");
  });

  it("falls back to a stock voice when no voice sample is provided at all", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(makeDraft());

    const result = await startVideoGeneration(planRecord, makeJob());

    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/v1/text-to-speech/")
      )
    ).toBe(true);
    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,BAUG");
    expect(result.voiceOverError).toBeUndefined();
  });

  it("falls back to a stock voice when ElevenLabs IVC fails (e.g. free tier)", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      // 1) IVC voices/add fails (e.g. free tier 401)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "voice cloning not available on this tier" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
      // 2) Stock TTS succeeds
      .mockResolvedValueOnce(
        new Response(new Uint8Array([7, 8, 9]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
        voiceConsent: true
      })
    );

    const result = await startVideoGeneration(planRecord, makeJob());

    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,BwgJ");
    expect(result.voiceOverError).toBeUndefined();
  });

  it("speech-to-speech: when voiceMode=speak-yourself and userMessageDataUrl is set, calls /v1/speech-to-speech/{voice_id} with the user's recording", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      // 1) IVC voices/add succeeds
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voice_id: "eleven_voice_s2s",
            requires_verification: false
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      // 2) Speech-to-speech conversion succeeds
      .mockResolvedValueOnce(
        new Response(new Uint8Array([10, 11, 12]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        })
      )
      // 3) Voice delete cleanup
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
        voiceConsent: true,
        voiceMode: "speak-yourself",
        userMessageDataUrl: "data:audio/webm;base64,bWVzc2FnZQ=="
      })
    );

    const result = await startVideoGeneration(planRecord, makeJob());

    // Must NOT call /v1/text-to-speech (TTS path).
    const ttsTextCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/v1/text-to-speech/")
    );
    expect(ttsTextCalls).toHaveLength(0);

    // Must call /v1/speech-to-speech/{voice_id} with the user's audio.
    const s2sCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/v1/speech-to-speech/eleven_voice_s2s")
    );
    expect(s2sCalls).toHaveLength(1);

    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,CgsM");
    expect(result.voiceOverError).toBeUndefined();
  });

  it("fails clearly instead of falling back to the stock demo video when fal is not configured", async () => {
    process.env.FAL_KEY = "";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi.fn<typeof fetch>();

    vi.stubGlobal("fetch", fetchMock);

    const started = await startVideoGeneration(makePlanRecord(), makeJob());
    const resolved = await resolveJobStatus(started);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(falClient.submit).not.toHaveBeenCalled();
    expect(started.stage).toBe("failed");
    expect(resolved).toMatchObject({
      stage: "failed",
      error: "FAL_KEY is required to generate a personalized video."
    });
    expect(resolved).not.toHaveProperty("videoUrl");
  });
});

function makeDraft(overrides: Partial<DraftRequest> = {}): DraftRequest {
  return {
    mode: "simple",
    prompt: "Make it a rooftop toast at sunset.",
    photoName: "birthday.png",
    photoDataUrl: "data:image/png;base64,ZmFrZQ==",
    advanced: {
      tone: "Heartfelt",
      sceneIdea: "Birthday dinner",
      videoLength: "10 seconds",
      aspectRatio: "Portrait",
      captionStyle: "Subtle",
      musicVibe: "Uplifting",
      motionIntensity: "Moderate",
      agentGoalMode: "Surprise me"
    },
    ...overrides
  };
}

function makePlan(): AgentPlan {
  return {
    title: "Birthday reveal",
    concept: "A cinematic birthday toast built from the uploaded photo.",
    vibe: "Warm and celebratory.",
    sceneDirection: "Use rooftop lights and a festive table.",
    motionDirection: "Slow push-in with gentle sparkle.",
    captionApproach: "Short and heartfelt.",
    generationStrategy: "Stay close to the photo while adding celebration details.",
    keepFromPhoto: ["Faces", "Clothing"],
    surpriseFactor: "A tasteful birthday reveal.",
    subjectCount: 2,
    identityAnchors: ["Woman on left", "Man on right"],
    sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
    safePrompt: "Preserve exactly two people and animate them naturally.",
    negativePrompt: "No extra people.",
    narrationVoiceCue: "warm American female, intimate"
  };
}

function makePlanRecord(draft = makeDraft()): PlanRecord {
  return {
    requestId: "req_123",
    draft,
    plan: makePlan(),
    caption: "Happy birthday, legend. Hope today feels cinematic.",
    createdAt: Date.now()
  };
}

function makeJob(): JobRecord {
  return {
    jobId: "job_123",
    requestId: "req_123",
    stage: "queued",
    statusMessage: "Queued and preparing the creative brief.",
    attempts: 1,
    caption: "Happy birthday, legend.",
    createdAt: Date.now()
  };
}
