import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreationForm } from "@/components/creation-form";
import { StudioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { DraftRequest, JobRecord } from "@/lib/types";

const originalMediaDevices = navigator.mediaDevices;

describe("CreationForm", () => {
  afterEach(() => {
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
    const createPlan = vi.fn<StudioApi["createPlan"]>().mockResolvedValue({
      requestId: "req_123",
      plan: {
        title: "Heartfelt birthday reveal",
        concept: "Turn the uploaded photo into a rooftop birthday memory.",
        vibe: "Warm and cinematic.",
        sceneDirection: "Lean into city lights and closeness.",
        motionDirection: "Soft motion with subtle reframing.",
        captionApproach: "Personal, warm, and easy to send.",
        generationStrategy: "Stay close to the source photo while elevating the mood.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Add a polished birthday-movie finish."
      },
      caption:
        "Happy birthday to one of my favorite people. I wanted this one to feel more personal than a normal text."
    });

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
      expect(screen.getByText("Agent plan")).toBeInTheDocument()
    );
    expect(createPlan).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Heartfelt birthday reveal")).toBeInTheDocument();
    expect(screen.getByText("On-video text")).toBeInTheDocument();
  });

  it("sends one optional voice sample with the draft", async () => {
    const user = userEvent.setup();
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) => ({
      requestId: "req_123",
      plan: {
        title: "Voice-over birthday reveal",
        concept: `Turn the uploaded photo into a narrated birthday beat centered on ${input.prompt}.`,
        vibe: "Warm and cinematic.",
        sceneDirection: "Lean into city lights and closeness.",
        motionDirection: "Soft motion with subtle reframing.",
        captionApproach: "Personal, warm, and easy to send.",
        generationStrategy: "Stay close to the source photo while elevating the mood.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Add a polished birthday-movie finish."
      },
      caption: "Happy birthday from me to you."
    }));

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
    await user.click(screen.getByLabelText(/I confirm this is my voice/));
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
    const createPlan = vi.fn<StudioApi["createPlan"]>(async (input) => ({
      requestId: "req_123",
      plan: {
        title: "Recorded voice-over birthday reveal",
        concept: `Turn the uploaded photo into a narrated birthday beat centered on ${input.prompt}.`,
        vibe: "Warm and cinematic.",
        sceneDirection: "Lean into city lights and closeness.",
        motionDirection: "Soft motion with subtle reframing.",
        captionApproach: "Personal, warm, and easy to send.",
        generationStrategy: "Stay close to the source photo while elevating the mood.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Add a polished birthday-movie finish."
      },
      caption: "Happy birthday from me to you."
    }));
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
      screen.getByText(/I wanted this to feel more personal/)
    ).toBeInTheDocument();
    expect(screen.getByText("Aim for about 30 seconds in a quiet room.")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Record voice sample" })
      ).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Record voice sample" }));
    expect(screen.getByText("Recording 0:00")).toBeInTheDocument();
    expect(screen.getByText("Upload instead")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() =>
      expect(screen.getByText("recorded-voice.webm")).toBeInTheDocument()
    );
    expect(screen.getByText("Recorded sample")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove voice sample" })
    ).toBeInTheDocument();

    await fillValidDraft(user);
    await user.click(screen.getByLabelText(/I confirm this is my voice/));
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
      screen.getByRole("button", { name: "Record voice sample" })
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

  it("runs through generation progress and shows the result screen", async () => {
    const user = userEvent.setup();
    const startGeneration = vi.fn<StudioApi["startGeneration"]>(async () => ({
      jobId: "job_123"
    }));
    const getJob = vi
      .fn<StudioApi["getJob"]>()
      .mockResolvedValueOnce({
        jobId: "job_123",
        requestId: "req_123",
        stage: "generating",
        statusMessage: "Generating the cinematic birthday video.",
        attempts: 1,
        caption: "Caption one. Caption two. Caption three. Caption four.",
        createdAt: Date.now()
      } satisfies JobRecord)
      .mockResolvedValueOnce({
        jobId: "job_123",
        requestId: "req_123",
        stage: "completed",
        statusMessage: "Birthday package ready.",
        attempts: 1,
        caption: "Caption one. Caption two. Caption three. Caption four.",
        createdAt: Date.now(),
        videoUrl: "https://example.com/video.mp4",
        voiceOverUrl: "data:audio/mpeg;base64,AQID"
      } satisfies JobRecord);

    const { container } = render(
      <CreationForm
        api={makeApi({
          startGeneration,
          getJob
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
      "https://example.com/video.mp4"
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
    expect(screen.getByText("Agent plan")).toBeInTheDocument();
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
    createPlan: vi.fn(async (input: DraftRequest) => ({
      requestId: "req_123",
      plan: {
        title: "Heartfelt birthday reveal",
        concept: `Turn the uploaded photo into a cinematic birthday beat centered on ${input.prompt}.`,
        vibe: "Warm and cinematic.",
        sceneDirection: "Lean into city lights and closeness.",
        motionDirection: "Soft motion with subtle reframing.",
        captionApproach: "Personal, warm, and easy to send.",
        generationStrategy: "Stay close to the source photo while elevating the mood.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Add a polished birthday-movie finish."
      },
      caption:
        "Happy birthday to one of my favorite people. I wanted this one to feel more personal than a normal text."
    })),
    startGeneration: vi.fn(async () => ({
      jobId: "job_123"
    })),
    getJob: vi.fn(async () => ({
      jobId: "job_123",
      requestId: "req_123",
      stage: "completed",
      statusMessage: "Birthday package ready.",
      attempts: 1,
      caption: "Caption one",
      createdAt: Date.now(),
      videoUrl: "https://example.com/video.mp4"
    }) satisfies JobRecord),
    ...overrides
  };
}
