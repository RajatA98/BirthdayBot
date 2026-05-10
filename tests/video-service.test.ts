const falClient = vi.hoisted(() => ({
  config: vi.fn(),
  upload: vi.fn(async () => "https://storage.example.com/photo.png"),
  submit: vi.fn(async () => ({ request_id: "fal_request_123" })),
  status: vi.fn(),
  result: vi.fn()
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: falClient.config,
    storage: {
      upload: falClient.upload
    },
    queue: {
      submit: falClient.submit,
      status: falClient.status,
      result: falClient.result
    }
  }
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

    expect(prompt).toContain("User visual direction: Make it a rooftop toast at sunset.");
    expect(prompt).toContain(
      "Treat the user visual direction as the main creative direction"
    );
    expect(prompt).toContain(
      "Embed only this exact tasteful subtle on-screen birthday text directly in the video frames"
    );
    expect(prompt).toContain('"Happy Birthday Maya"');
    expect(prompt).toContain("Do not add any other words");
    expect(prompt).toContain("gold, coral, and champagne gradient lettering");
    expect(prompt).toContain("Avoid plain white text.");
    expect(prompt).toContain("fun uplifting birthday party music bed");
    expect(prompt).toContain("birthday celebration");
    expect(prompt).toContain("cake");
    expect(prompt).toContain("confetti");
    expect(prompt).toContain("lively birthday party backdrop");
    expect(prompt).toContain("party lights");
    expect(prompt).toContain("do not add guests");
    expect(prompt).toContain("background people");
    expect(prompt).toContain("extra faces");
    expect(prompt).toContain("Make it really fun and energetic");
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
    expect(prompt).toContain("fun playful birthday party music bed");
    expect(prompt).toContain("tasteful bold on-screen birthday text");
    expect(prompt).toContain('"Happy Birthday Maya"');
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

    expect(prompt).toContain("Do not generate native audio");
    expect(prompt).toContain("only the user's cloned narration");
    expect(prompt).toContain("low-volume uplifting birthday party music bed");
    expect(prompt).toContain("Do not generate spoken narration");
    expect(prompt).toContain("crowd noise");
    expect(prompt).not.toContain("<<<voice_1>>>");
  });

  it("keeps on-video text to only the birthday name line", () => {
    const prompt = buildFalPrompt(
      makeDraft(),
      makePlan(),
      "Happy birthday, legend. I wanted this to feel more personal than a normal text. Hope your day feels cinematic. This extra sentence should stay out."
    );

    expect(prompt).toContain('"Happy Birthday Maya"');
    expect(prompt).not.toContain("I wanted this to feel more personal");
    expect(prompt).not.toContain("Hope your day feels cinematic");
    expect(prompt).not.toContain("This extra sentence should stay out.");
  });

  it("sanitizes audio cleanup requests before sending a prompt to the video provider", () => {
    const prompt = buildFalPrompt(
      makeDraft({
        prompt:
          "remove screams in background of audio. audio should be the narration, and some party background music at low volume."
      }),
      {
        ...makePlan(),
        concept:
          "Turn the uploaded photo into a cinematic birthday beat centered on remove screams in background of audio."
      },
      "Happy birthday, legend."
    );

    expect(prompt).toContain("User visual direction: Create a cheerful birthday party video");
    expect(prompt).toContain("gentle festive instrumental music underneath");
    expect(prompt.toLowerCase()).not.toContain("scream");
    expect(prompt.toLowerCase()).not.toContain("remove screams");
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

  it("enables native audio for default v3 without sending unsupported aspect ratio", () => {
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
      generate_audio: true
    });
    expect(input).not.toHaveProperty("image_url");
    expect(input).not.toHaveProperty("aspect_ratio");
  });

  it("caps v3 generation to the provider's live 15-second duration limit", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v3/standard/image-to-video",
      "https://example.com/photo.png",
      makeDraft({
        mode: "advanced",
        advanced: {
          ...makeDraft().advanced,
          videoLength: "30 seconds"
        }
      }),
      makePlan(),
      "Happy birthday."
    );

    expect(input.duration).toBe("15");
    expect(input.prompt?.length).toBeLessThanOrEqual(512);
    expect(input.prompt).toContain("birthday party video");
    expect(input.prompt).toContain("balloons");
    expect(input.prompt).toContain("confetti");
    expect(input.prompt).toContain("cake candles");
    expect(input.prompt).toContain("party lights");
    expect(input.prompt).toContain("do not add guests");
    expect(input.prompt).toContain("extra faces");
    expect(input).not.toHaveProperty("multi_prompt");
    expect(input).not.toHaveProperty("shot_type");
  });

  it("keeps Kling provider prompts within the live 512 character limit", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v3/standard/image-to-video",
      "https://example.com/photo.png",
      makeDraft({
        prompt:
          "remove screams in background of audio. audio should be the narration, and some party background music at low volume."
      }),
      {
        ...makePlan(),
        concept:
          "Turn the uploaded photo into a cinematic birthday beat centered on remove screams in background of audio."
      },
      "Happy birthday, legend."
    );

    const prompts = input.multi_prompt?.map((shot) => shot.prompt) || [
      input.prompt || ""
    ];

    expect(prompts.every((prompt) => prompt.length <= 512)).toBe(true);
    expect(prompts.join(" ").toLowerCase()).not.toContain("scream");
    expect(input.duration).toBe("15");
  });

  it("keeps Kling v2.6 input to fields its schema supports", () => {
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
      start_image_url: "https://example.com/photo.png",
      generate_audio: false
    });
    expect(input).not.toHaveProperty("aspect_ratio");
    expect(input).not.toHaveProperty("cfg_scale");
    expect(input).not.toHaveProperty("voice_ids");
    expect(input.prompt).not.toContain("<<<voice_1>>>");
  });

  it("uses a conservative payload for provider retry attempts", () => {
    const input = buildFalInput(
      "fal-ai/kling-video/v3/standard/image-to-video",
      "https://example.com/photo.png",
      makeDraft({
        mode: "advanced",
        advanced: {
          ...makeDraft().advanced,
          videoLength: "30 seconds"
        }
      }),
      makePlan(),
      "Happy birthday.",
      { safeRetry: true }
    );

    expect(input).toMatchObject({
      start_image_url: "https://example.com/photo.png",
      duration: "5",
      generate_audio: false
    });
    expect(input.prompt).toContain("Create a cheerful birthday party video");
    expect(input.prompt).toContain("Do not add captions");
    expect(input.prompt).not.toContain("Embed only this exact");
    expect(input).not.toHaveProperty("negative_prompt");
    expect(input).not.toHaveProperty("cfg_scale");
  });
});

describe("startVideoGeneration voice-over", () => {
  const originalFalKey = process.env.FAL_KEY;
  const originalFalVideoModel = process.env.FAL_VIDEO_MODEL;
  const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY;

  afterEach(() => {
    process.env.FAL_KEY = originalFalKey;
    process.env.FAL_VIDEO_MODEL = originalFalVideoModel;
    process.env.ELEVENLABS_API_KEY = originalElevenLabsKey;
    falClient.config.mockClear();
    falClient.upload.mockClear();
    falClient.submit.mockClear();
    falClient.status.mockReset();
    falClient.result.mockReset();
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
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      text: "Happy birthday, legend. Hope today feels cinematic."
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.elevenlabs.io/v1/voices/eleven_voice_123"
    );
    expect(result.providerVoiceId).toBe("eleven_voice_123");
    expect(result.voiceOverUrl).toBe("data:audio/mpeg;base64,AQID");
    expect(result.providerRequestId).toBe("fal_request_123");
    expect(result.targetDurationSeconds).toBe(15);
    expect(falClient.submit).toHaveBeenCalledTimes(1);
    expect(planRecord.draft.voiceSampleDataUrl).toBeUndefined();
    expect(planRecord.draft.voiceConsent).toBeUndefined();
  });

  it("strips accidental filler before sending the generated script to ElevenLabs", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ voice_id: "eleven_voice_123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    await startVideoGeneration(
      {
        ...makePlanRecord(
          makeDraft({
            voiceSampleName: "sample.wav",
            voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
            voiceConsent: true
          })
        ),
        caption:
          "Voice-over: um, testing one two. Happy birthday Maya. You make every room brighter."
      },
      makeJob()
    );

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      text: "Happy birthday Maya. You make every room brighter."
    });
  });

  it("retries FAL submission with a minimal payload after a 422 schema rejection", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.FAL_VIDEO_MODEL = "fal-ai/kling-video/v2.1/pro/image-to-video";
    process.env.ELEVENLABS_API_KEY = "";
    falClient.submit
      .mockRejectedValueOnce(new Error("Unprocessable Entity"))
      .mockResolvedValueOnce({ request_id: "fal_retry_123" });

    const result = await startVideoGeneration(makePlanRecord(), makeJob());
    const submitCalls = falClient.submit.mock.calls as unknown as Array<
      [string, { input: unknown }]
    >;
    const firstInput = submitCalls[0][1].input;
    const secondInput = submitCalls[1][1].input;

    expect(falClient.submit).toHaveBeenCalledTimes(2);
    expect(firstInput).toMatchObject({
      aspect_ratio: "9:16",
      cfg_scale: 0.65
    });
    expect(secondInput).toMatchObject({
      aspect_ratio: "9:16"
    });
    expect(secondInput).not.toHaveProperty("generate_audio");
    expect(secondInput).not.toHaveProperty("cfg_scale");
    expect(secondInput).not.toHaveProperty("negative_prompt");
    expect(result.providerRequestId).toBe("fal_retry_123");
  });

  it("keeps simplifying FAL submissions when the first schema fallback is also rejected", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.FAL_VIDEO_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
    process.env.ELEVENLABS_API_KEY = "";
    falClient.submit
      .mockRejectedValueOnce(new Error("Unprocessable Entity"))
      .mockRejectedValueOnce(new Error("Unprocessable Entity"))
      .mockResolvedValueOnce({ request_id: "fal_minimal_123" });

    const result = await startVideoGeneration(makePlanRecord(), makeJob());
    const submitCalls = falClient.submit.mock.calls as unknown as Array<
      [string, { input: unknown }]
    >;
    const minimalInput = submitCalls[2][1].input;

    expect(falClient.submit).toHaveBeenCalledTimes(3);
    expect(minimalInput).toMatchObject({
      start_image_url: "https://storage.example.com/photo.png",
      duration: "5"
    });
    expect(minimalInput).toHaveProperty("prompt");
    expect(minimalInput).not.toHaveProperty("multi_prompt");
    expect(minimalInput).not.toHaveProperty("generate_audio");
    expect(minimalInput).not.toHaveProperty("cfg_scale");
    expect(minimalInput).not.toHaveProperty("negative_prompt");
    expect(result.providerRequestId).toBe("fal_minimal_123");
  });

  it("does not submit a voice sample to ElevenLabs without confirmed consent", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    const fetchMock = vi.fn<typeof fetch>();

    vi.stubGlobal("fetch", fetchMock);

    const planRecord = makePlanRecord(
      makeDraft({
        voiceSampleName: "sample.wav",
        voiceSampleDataUrl: "data:audio/wav;base64,ZmFrZQ==",
        voiceConsent: false
      })
    );

    const result = await startVideoGeneration(planRecord, makeJob());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.voiceOverError).toBe(
      "Voice-over skipped because voice-cloning consent was not confirmed."
    );
    expect(result.providerRequestId).toBe("fal_request_123");
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

  it("returns a failed job instead of throwing when provider polling returns 422", async () => {
    process.env.FAL_KEY = "test-fal-key";
    falClient.status.mockRejectedValueOnce(new Error("Unprocessable Entity"));

    const resolved = await resolveJobStatus({
      ...makeJob(),
      providerRequestId: "fal_request_123",
      providerEndpoint: "fal-ai/kling-video/v2.6/pro/image-to-video"
    });

    expect(resolved).toMatchObject({
      stage: "failed",
      statusMessage: "The video provider rejected the queued generation request.",
      error: "Unprocessable Entity"
    });
  });
});

function makeDraft(overrides: Partial<DraftRequest> = {}): DraftRequest {
  return {
    mode: "simple",
    birthdayName: "Maya",
    prompt: "Make it a rooftop toast at sunset.",
    photoName: "birthday.png",
    photoDataUrl: "data:image/png;base64,ZmFrZQ==",
    advanced: {
      tone: "Heartfelt",
      sceneIdea: "Birthday party",
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
    surpriseFactor: "A tasteful birthday reveal."
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
