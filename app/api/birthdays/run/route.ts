import { NextResponse } from "next/server";

import { defaultAdvancedSettings } from "@/lib/defaults";
import { makeId } from "@/lib/id";
import {
  listDueBirthdayProfiles,
  saveBirthdayDelivery,
  saveJob,
  savePlan,
  updateBirthdayProfile,
  updateJob
} from "@/lib/memory-store";
import { generatePlanAndCaption } from "@/lib/plan-service";
import {
  BirthdayDelivery,
  BirthdayRunResponse,
  DraftRequest,
  JobRecord,
  PlanRecord
} from "@/lib/types";
import { startVideoGeneration } from "@/lib/video-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const runDate = body.date ? parseRunDate(body.date) : new Date();

    if (!runDate) {
      return NextResponse.json(
        { error: "date must use YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    const dueProfiles = listDueBirthdayProfiles(runDate);
    const response: BirthdayRunResponse = {
      date: formatDate(runDate),
      generated: [],
      skipped: []
    };

    for (const profile of dueProfiles) {
      try {
        const draft: DraftRequest = {
          mode: "advanced",
          prompt: birthdayPrompt(profile.name, profile.relationship, profile.customPrompt),
          photoName: profile.photoName,
          photoDataUrl: profile.photoDataUrl,
          advanced: {
            ...defaultAdvancedSettings,
            tone: "Heartfelt",
            musicVibe: "Uplifting",
            captionStyle: "Subtle",
            agentGoalMode: "Stay close to prompt"
          }
        };
        const generated = await generatePlanAndCaption(draft);
        const requestId = makeId("req");
        const planRecord: PlanRecord = {
          requestId,
          draft,
          plan: generated.plan,
          caption: generated.caption,
          createdAt: Date.now()
        };
        const job: JobRecord = {
          jobId: makeId("job"),
          requestId,
          stage: "queued",
          statusMessage: "Queued from birthday automation.",
          attempts: 1,
          caption: generated.caption,
          createdAt: Date.now()
        };
        const delivery: BirthdayDelivery = {
          id: makeId("delivery"),
          profileId: profile.id,
          profileName: profile.name,
          scheduledFor: response.date,
          deliveryEmail: profile.deliveryEmail,
          requestId,
          jobId: job.jobId,
          status: "generating",
          createdAt: Date.now()
        };

        savePlan(planRecord);
        saveJob(job);
        saveBirthdayDelivery(delivery);

        try {
          const providerJob = await startVideoGeneration(planRecord, job);
          updateJob(job.jobId, providerJob);
        } catch (error) {
          updateJob(job.jobId, {
            stage: "failed",
            statusMessage:
              "Video generation could not be started.",
            error:
              error instanceof Error
                ? error.message
                : "Provider startup failed before a video job was created."
          });
          console.error("[birthdays/run] startVideoGeneration failed:", error);
        }

        updateBirthdayProfile(profile.id, {
          lastGeneratedYear: runDate.getFullYear()
        });
        response.generated.push(delivery);
      } catch (error) {
        const delivery: BirthdayDelivery = {
          id: makeId("delivery"),
          profileId: profile.id,
          profileName: profile.name,
          scheduledFor: response.date,
          deliveryEmail: profile.deliveryEmail,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Birthday video generation failed.",
          createdAt: Date.now()
        };

        saveBirthdayDelivery(delivery);
        response.generated.push(delivery);
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Birthday automation run failed."
      },
      { status: 500 }
    );
  }
}

function birthdayPrompt(name: string, relationship: string, customPrompt: string) {
  return [
    `Create an automatic birthday video for ${name}, my ${relationship}.`,
    customPrompt,
    "Include tasteful embedded on-screen birthday text and uplifting music in the video."
  ].join(" ");
}

function parseRunDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}
