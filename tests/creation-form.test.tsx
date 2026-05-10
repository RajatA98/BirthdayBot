import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreationForm } from "@/components/creation-form";
import { StudioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { DraftRequest, JobRecord } from "@/lib/types";

describe("CreationForm", () => {
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
        surpriseFactor: "Add a polished birthday-movie finish.",
        subjectCount: 2,
        identityAnchors: ["Woman on left", "Man on right"],
        sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
        safePrompt: "Preserve exactly two people and animate them naturally.",
        negativePrompt: "No extra people."
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
    expect(screen.getByText("Birthday caption")).toBeInTheDocument();
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
      screen.getByText("Photo loaded. You can drop another file to replace it.")
    ).toBeInTheDocument();
  });

  it("runs through generation progress and shows the result screen", async () => {
    const user = userEvent.setup();
    const getJob = vi
      .fn<StudioApi["getJob"]>()
      .mockResolvedValueOnce({
        jobId: "job_123",
        requestId: "req_123",
        stage: "generating",
        statusMessage: "Generating the cinematic birthday video.",
        attempts: 1,
        caption: "Caption one",
        createdAt: Date.now()
      } satisfies JobRecord)
      .mockResolvedValueOnce({
        jobId: "job_123",
        requestId: "req_123",
        stage: "completed",
        statusMessage: "Birthday package ready.",
        attempts: 1,
        caption: "Caption one",
        createdAt: Date.now(),
        videoUrl: "https://example.com/video.mp4"
      } satisfies JobRecord);

    render(
      <CreationForm
        api={makeApi({
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
    expect(screen.getByText("Generation in progress")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Birthday package ready")).toBeInTheDocument()
    , { timeout: 2500 });
    expect(screen.getByRole("link", { name: "Download video" })).toHaveAttribute(
      "href",
      "https://example.com/video.mp4"
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

async function fillValidDraft(user: ReturnType<typeof userEvent.setup>) {
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
        surpriseFactor: "Add a polished birthday-movie finish.",
        subjectCount: 2,
        identityAnchors: ["Woman on left", "Man on right"],
        sceneGuardrails: ["Preserve exactly two people", "No identity drift"],
        safePrompt: "Preserve exactly two people and animate them naturally.",
        negativePrompt: "No extra people."
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
    })),
    ...overrides
  };
}
