import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const falStorageUpload = vi.hoisted(() =>
  vi.fn(async () => "https://example.fal.media/uploaded-photo.png")
);

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: falStorageUpload }
  }
}));

import { CreationForm } from "@/components/creation-form";
import { StudioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { DraftRequest, JobRecord, PlanRecord } from "@/lib/types";

const fallbackDraft: DraftRequest = {
  mode: "simple",
  prompt: "Make it cinematic.",
  photoName: "test.png",
  photoDataUrl: "data:image/png;base64,ZmFrZQ==",
  advanced: defaultAdvancedSettings
};

const standardPlan: PlanRecord["plan"] = {
  title: "Heartfelt birthday reveal",
  concept: "Turn the uploaded photo into a rooftop birthday memory.",
  vibe: "Warm and cinematic.",
  sceneDirection: "Lean into city lights and closeness.",
  motionDirection: "Soft motion with subtle reframing.",
  captionApproach: "Personal, warm, and easy to send.",
  generationStrategy: "Stay close to the source photo while elevating the mood.",
  keepFromPhoto: ["Faces", "Clothing"],
  surpriseFactor: "Add a polished birthday-movie finish.",
  subjectCount: 2,
  identityAnchors: ["Woman on left", "Man on right"],
  sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
  safePrompt: "Preserve exactly two people and animate them naturally.",
  negativePrompt: "No extra people.",
  narrationVoiceCue: "warm American female, intimate"
};

function mockPlanRecord(
  draft: DraftRequest = fallbackDraft,
  overrides: Partial<PlanRecord> = {}
): PlanRecord {
  return {
    requestId: "req_123",
    draft,
    plan: standardPlan,
    caption:
      "Happy birthday to one of my favorite people. I wanted this one to feel more personal than a normal text.",
    createdAt: Date.now(),
    ...overrides
  };
}

function mockJobRecord(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: "job_123",
    requestId: "req_123",
    stage: "queued",
    statusMessage: "Queued and preparing the creative brief.",
    attempts: 1,
    caption: "Happy birthday to one of my favorite people.",
    createdAt: Date.now(),
    ...overrides
  };
}

const originalMediaDevices = navigator.mediaDevices;

describe("CreationForm", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices
    });
  });

  it("starts in simple mode with advanced controls hidden", () => {
    render(<CreationForm api={makeApi()} />);

    expect(
      screen.getByRole("button", { name: "Simple" })
    ).toHaveClass("active");
    expect(screen.queryByLabelText("Advanced controls")).not.toBeInTheDocument();
  });

  it("shows advanced controls when advanced mode is selected", async () => {
    const user = userEvent.setup();
    render(<CreationForm api={makeApi()} />);

    await user.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByLabelText("Advanced controls")).toBeInTheDocument();
    expect(screen.getByLabelText("Tone")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent goal mode")).toBeInTheDocument();
  });

  it("shows validation errors when prompt and photo are missing", async () => {
    const user = userEvent.setup();
    render(<CreationForm api={makeApi()} />);

    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));

    expect(
      screen.getByText("Describe what the birthday video should feel like.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Add their name for the birthday text.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Add one shared photo to continue.")
    ).toBeInTheDocument();
  });

  it("creates a plan and renders the review screen", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) =>
      mockPlanRecord(input)
    );

    render(
      <CreationForm
        api={makeApi({
          createPlan
        })}
      />
    );

    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));

    await waitFor(() =>
      expect(screen.getByText(/Agent plan/i)).toBeInTheDocument()
    );
    expect(createPlan).toHaveBeenCalledTimes(1);
    expect(
      screen.getByDisplayValue("Heartfelt birthday reveal")
    ).toBeInTheDocument();
    expect(screen.getByText("Birthday message")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Editable birthday message")
    ).toBeInTheDocument();
  });

  it("sends one optional voice sample with the draft", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) =>
      mockPlanRecord(input, {
        plan: {
          ...standardPlan,
          title: "Voice-over birthday reveal",
          concept: `Turn the uploaded photo into a narrated birthday beat centered on ${input.prompt}.`
        },
        caption: "Happy birthday from me to you."
      })
    );

    render(
      <CreationForm
        api={makeApi({
          createPlan
        })}
      />
    );

    await fillValidDraft(user);
    await user.upload(
      screen.getByLabelText("Voice sample"),
      new File(["fake-audio"], "voice.wav", { type: "audio/wav" })
    );
    await user.click(screen.getByLabelText(/This is my own voice/i));
    await user.click(
      screen.getByLabelText(/I consent to my voice being processed/i)
    );
    await user.click(
      screen.getByLabelText(/output will be labeled as AI-generated/i)
    );
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceSampleName: "voice.wav",
        voiceSampleDataUrl: expect.stringMatching(/^data:audio\/wav;base64,/),
        voiceConsent: true
      })
    );
  });

  it("uploads the photo directly to fal storage before calling /api/plan", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) =>
      mockPlanRecord(input)
    );
    falStorageUpload.mockClear();
    falStorageUpload.mockResolvedValueOnce(
      "https://example.fal.media/uploaded-photo.png"
    );

    render(<CreationForm api={makeApi({ createPlan })} />);

    await fillValidDraft(user);
    await user.click(
      screen.getByRole("button", { name: "Build my birthday brief" })
    );

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(falStorageUpload).toHaveBeenCalledTimes(1);
    const draftSent = createPlan.mock.calls[0]?.[0] as DraftRequest;
    expect(draftSent.photoDataUrl).toBe(
      "https://example.fal.media/uploaded-photo.png"
    );
    expect(draftSent.photoDataUrl.startsWith("data:")).toBe(false);
  });

  it("requires consent before submitting a voice sample for cloning", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>();

    render(
      <CreationForm
        api={makeApi({
          createPlan
        })}
      />
    );

    await fillValidDraft(user);
    await user.upload(
      screen.getByLabelText("Voice sample"),
      new File(["fake-audio"], "voice.wav", { type: "audio/wav" })
    );
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));

    expect(
      screen.getByText(
        "Confirm you have the rights to clone this voice before continuing."
      )
    ).toBeInTheDocument();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("records a voice sample from the microphone", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) =>
      mockPlanRecord(input, {
        plan: {
          ...standardPlan,
          title: "Recorded voice-over birthday reveal",
          concept: `Turn the uploaded photo into a narrated birthday beat centered on ${input.prompt}.`
        },
        caption: "Happy birthday from me to you."
      })
    );
    const stopTrack = vi.fn();

    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }]
        }))
      }
    });

    render(
      <CreationForm
        api={makeApi({
          createPlan
        })}
      />
    );

    expect(
      screen.getByText("Record a personalized voice-over sample.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Record one short phrase at a time/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Step 1 of 3 · Neutral tone/)
    ).toBeInTheDocument();
    expect(screen.getAllByText("Neutral").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Excited").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Warm").length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record sample" })
      ).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Record sample" }));
    expect(screen.getByText("Recording 0:00")).toBeInTheDocument();
    expect(screen.getByText("Upload instead")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish neutral take" }));

    await waitFor(() =>
      expect(screen.getByText(/Step 2 of 3 · Excited tone/)).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Record excited take" }));
    await user.click(screen.getByRole("button", { name: "Finish excited take" }));

    await waitFor(() =>
      expect(screen.getByText(/Step 3 of 3 · Warm tone/)).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Record warm take" }));
    await user.click(screen.getByRole("button", { name: "Finish warm take" }));

    await waitFor(() =>
      expect(screen.getByText("recorded-voice.webm")).toBeInTheDocument()
    );
    expect(
      screen.getByText(/Calibration complete · Warm tone selected/)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sample ready. Re-record any tone if you want a better match.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Neutral" }));
    expect(
      screen.getByText(/Calibration complete · Neutral tone selected/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Re-record neutral take" })
    ).toBeInTheDocument();
    expect(screen.getByText("Recorded sample")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove voice sample" })
    ).toBeInTheDocument();

    await fillValidDraft(user);
    await user.click(screen.getByLabelText(/This is my own voice/i));
    await user.click(
      screen.getByLabelText(/I consent to my voice being processed/i)
    );
    await user.click(
      screen.getByLabelText(/output will be labeled as AI-generated/i)
    );
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(stopTrack).toHaveBeenCalled();
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceSampleName: "recorded-voice.webm",
        voiceSampleDataUrl: expect.stringMatching(
          /^data:audio\/webm(?:;codecs=opus)?;base64,/
        ),
        voiceConsent: true
      })
    );
  });

  it("keeps upload available when browser recording is not supported", () => {
    render(<CreationForm api={makeApi()} />);

    expect(
      screen.getByText(
        "Browser microphone recording is unavailable here, but uploading an audio or video file still works."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record sample" })
    ).toBeDisabled();
  });

  it("rejects a non-media voice sample", async () => {
    render(<CreationForm api={makeApi()} />);

    fireEvent.change(screen.getByLabelText("Voice sample"), {
      target: {
        files: [new File(["fake-text"], "voice.txt", { type: "text/plain" })]
      }
    });

    expect(
      screen.getByText("Use one audio or video file for the voice sample.")
    ).toBeInTheDocument();
  });

  it("shows the selected photo name in the upload surface", async () => {
    const user = userEvent.setup();
    render(<CreationForm api={makeApi()} />);

    await user.upload(
      screen.getByLabelText("Shared photo"),
      new File(["fake-image"], "birthday-duo.png", { type: "image/png" })
    );

    expect(screen.getByText("birthday-duo.png")).toBeInTheDocument();
    expect(
      screen.getByAltText("Selected shared photo preview")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Photo loaded. You can drop another file to replace it.")
    ).toBeInTheDocument();
  });

  it("runs through generation progress and shows the result screen", async () => {
    const user = userEvent.setup();
    const startGeneration = vi.fn<StudioApi["startGeneration"]>(async () =>
      mockJobRecord({
        stage: "generating",
        statusMessage: "Generating the cinematic birthday video.",
        caption: "Caption one. Caption two. Caption three. Caption four."
      })
    );
    const checkJob = vi
      .fn<StudioApi["checkJob"]>()
      .mockResolvedValueOnce(
        mockJobRecord({
          stage: "generating",
          statusMessage: "Generating the cinematic birthday video.",
          caption: "Caption one. Caption two. Caption three. Caption four."
        })
      )
      .mockResolvedValueOnce(
        mockJobRecord({
          stage: "completed",
          statusMessage: "Birthday package ready.",
          caption: "Caption one. Caption two. Caption three. Caption four.",
          videoUrl: "https://example.com/video.mp4",
          voiceOverUrl: "data:audio/mpeg;base64,AQID"
        })
      );

    const { container } = render(
      <CreationForm
        api={makeApi({
          startGeneration,
          checkJob
        })}
      />
    );

    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate birthday video" })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Generate birthday video" }));
    expect(startGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req_123",
        draft: expect.objectContaining({
          birthdayName: "Maya",
          prompt: "Make it feel like a funny rooftop birthday movie trailer.",
          photoName: "birthday-duo.png"
        }),
        plan: expect.objectContaining({
          title: "Heartfelt birthday reveal"
        }),
        caption:
          "Happy birthday to one of my favorite people. I wanted this one to feel more personal than a normal text."
      })
    );
    expect(screen.getByText("Generation in progress")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Birthday video loading animation" })
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Birthday package ready")).toBeInTheDocument()
    , { timeout: 2500 });
    expect(screen.getByLabelText("Happy Birthday Maya")).toBeInTheDocument();
    expect(screen.queryByText(/Caption one/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Caption four/)).not.toBeInTheDocument();
    expect(screen.queryByText("Birthday caption")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download video" })).toHaveAttribute(
      "href",
      `/api/download?url=${encodeURIComponent("https://example.com/video.mp4")}&name=birthdaybot-video-job_123.mp4`
    );
    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      "data:audio/mpeg;base64,AQID"
    );
  });

  it("shows a review-stage error if generation cannot be started", async () => {
    const user = userEvent.setup();

    render(
      <CreationForm
        api={makeApi({
          startGeneration: vi.fn(async () => {
            throw new Error("Generation provider is unavailable.");
          })
        })}
      />
    );

    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate birthday video" })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Generate birthday video" }));

    await waitFor(() =>
      expect(screen.getByText("Generation provider is unavailable.")).toBeInTheDocument()
    );
    expect(screen.getByText(/Agent plan/i)).toBeInTheDocument();
  });

  it("shows copy feedback after copying the caption", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(<CreationForm api={makeApi()} />);

    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate birthday video" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Generate birthday video" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy caption" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Copy caption" }));

    expect(writeText).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Caption copied" })).toBeInTheDocument()
    );
  });

  it("resets the flow when making a new video from the result screen", async () => {
    const user = userEvent.setup();

    render(<CreationForm api={makeApi()} />);

    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: "Build my birthday brief" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate birthday video" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Generate birthday video" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Make a new video" })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Make a new video" }));

    expect(screen.getByRole("button", { name: "Build my birthday brief" })).toBeInTheDocument();
    expect(screen.getByText("Drag and drop a photo here")).toBeInTheDocument();
  });
});

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["recorded-audio"], { type: this.mimeType })
    } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

async function fillValidDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Birthday name"), "Maya");
  await user.type(
    screen.getByLabelText("Prompt"),
    "Make it feel like a funny rooftop birthday movie trailer."
  );
  await user.upload(
    screen.getByLabelText("Shared photo"),
    new File(["fake-image"], "birthday-duo.png", { type: "image/png" })
  );
}

function makeApi(overrides: Partial<StudioApi> = {}): StudioApi {
  return {
    createPlan: vi.fn(async (input: DraftRequest) =>
      mockPlanRecord(input, {
        plan: {
          ...standardPlan,
          concept: `Turn the uploaded photo into a cinematic birthday beat centered on ${input.prompt}.`
        }
      })
    ),
    startGeneration: vi.fn(async () =>
      mockJobRecord({
        stage: "completed",
        statusMessage: "Birthday package ready.",
        caption: "Caption one",
        videoUrl: "https://example.com/video.mp4"
      })
    ),
    checkJob: vi.fn(async () =>
      mockJobRecord({
        stage: "completed",
        statusMessage: "Birthday package ready.",
        caption: "Caption one",
        videoUrl: "https://example.com/video.mp4"
      })
    ),
    ...overrides
  };
}
