import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BirthdayScheduler } from "@/components/birthday-scheduler";
import { StudioApi } from "@/lib/client-api";
import { BirthdayProfileInput, DraftRequest, JobRecord } from "@/lib/types";

describe("BirthdayScheduler", () => {
  it("saves a manual birthday profile with relationship and custom prompt", async () => {
    const user = userEvent.setup();
    const createBirthdayProfile = vi.fn<StudioApi["createBirthdayProfile"]>(
      async (input: BirthdayProfileInput) => ({
        profiles: [
          {
            id: "bday_123",
            ...input,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        deliveries: []
      })
    );

    render(
      <BirthdayScheduler
        api={makeApi({
          createBirthdayProfile
        })}
      />
    );

    await user.type(screen.getByLabelText("Birthday person name"), "Maya");
    await user.type(screen.getByLabelText("Relationship"), "Sister");
    await user.type(screen.getByLabelText("Birthday"), "2026-05-10");
    await user.type(screen.getByLabelText("Delivery email"), "me@example.com");
    await user.type(
      screen.getByLabelText("Custom birthday prompt"),
      "Make it feel like a cozy family birthday dinner."
    );
    await user.upload(
      screen.getByLabelText("Birthday photo"),
      new File(["fake-image"], "maya.png", { type: "image/png" })
    );
    await user.click(screen.getByRole("button", { name: "Add birthday" }));

    await waitFor(() =>
      expect(createBirthdayProfile).toHaveBeenCalledTimes(1)
    );
    expect(createBirthdayProfile.mock.calls[0][0]).toMatchObject({
      name: "Maya",
      relationship: "Sister",
      birthday: "2026-05-10",
      deliveryEmail: "me@example.com",
      customPrompt: "Make it feel like a cozy family birthday dinner.",
      autoSend: true
    });
    expect(screen.getByText("Maya is on the birthday schedule.")).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
  });

  it("can start the due birthday automation run", async () => {
    const user = userEvent.setup();
    const runBirthdayAutomation = vi.fn<StudioApi["runBirthdayAutomation"]>(
      async () => ({
        date: "2026-05-10",
        generated: [
          {
            id: "delivery_123",
            profileId: "bday_123",
            profileName: "Maya",
            scheduledFor: "2026-05-10",
            deliveryEmail: "me@example.com",
            status: "generating",
            createdAt: Date.now()
          }
        ],
        skipped: []
      })
    );

    render(
      <BirthdayScheduler
        api={makeApi({
          runBirthdayAutomation,
          listBirthdayProfiles: vi
            .fn<StudioApi["listBirthdayProfiles"]>()
            .mockResolvedValueOnce({ profiles: [], deliveries: [] })
            .mockResolvedValueOnce({
              profiles: [],
              deliveries: [
                {
                  id: "delivery_123",
                  profileId: "bday_123",
                  profileName: "Maya",
                  scheduledFor: "2026-05-10",
                  deliveryEmail: "me@example.com",
                  status: "generating",
                  createdAt: Date.now()
                }
              ]
            })
        })}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: "Generate due videos now" })
    );

    await waitFor(() =>
      expect(runBirthdayAutomation).toHaveBeenCalledTimes(1)
    );
    expect(screen.getByText("1 birthday video run started.")).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
  });
});

function makeApi(overrides: Partial<StudioApi> = {}): StudioApi {
  return {
    createPlan: vi.fn(async (input: DraftRequest) => ({
      requestId: "req_123",
      plan: {
        title: "Birthday reveal",
        concept: `Birthday video for ${input.prompt}.`,
        vibe: "Warm.",
        sceneDirection: "Birthday dinner.",
        motionDirection: "Soft motion.",
        captionApproach: "Short.",
        generationStrategy: "Stay close to the photo.",
        keepFromPhoto: ["Faces", "Clothing"],
        surpriseFactor: "Candles."
      },
      caption: "Happy birthday."
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
      caption: "Happy birthday.",
      createdAt: Date.now(),
      videoUrl: "https://example.com/video.mp4"
    }) satisfies JobRecord),
    listBirthdayProfiles: vi.fn(async () => ({
      profiles: [],
      deliveries: []
    })),
    createBirthdayProfile: vi.fn(async () => ({
      profiles: [],
      deliveries: []
    })),
    runBirthdayAutomation: vi.fn(async () => ({
      date: "2026-05-10",
      generated: [],
      skipped: []
    })),
    ...overrides
  };
}
