import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import { getPlan, saveJob, savePlan, updateJob } from "@/lib/memory-store";
import { GenerateRequest, JobRecord, PlanRecord } from "@/lib/types";
import { startVideoGeneration } from "@/lib/video-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<GenerateRequest>;
    const requestId = body.requestId;

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required." },
        { status: 400 }
      );
    }

    const planRecord = resolvePlanRecord(requestId, body);

    if (!planRecord) {
      return NextResponse.json(
        {
          error:
            "Plan not found. Build the birthday brief again before starting generation."
        },
        { status: 404 }
      );
    }

    const initialJob: JobRecord = {
      jobId: makeId("job"),
      requestId,
      stage: "queued",
      statusMessage: "Queued and preparing the creative brief.",
      attempts: 1,
      caption: planRecord.caption,
      createdAt: Date.now()
    };

    saveJob(initialJob);

    try {
      const providerJob = await startVideoGeneration(planRecord, initialJob);
      updateJob(initialJob.jobId, providerJob);
    } catch (err) {
      console.error("[generate] startVideoGeneration failed:", JSON.stringify(err, null, 2));
      updateJob(initialJob.jobId, {
        stage: "failed",
        statusMessage: "Video generation could not be started.",
        error:
          err instanceof Error
            ? err.message
            : "Provider startup failed before a video job was created."
      });
    }

    return NextResponse.json({ jobId: initialJob.jobId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Generation could not be started."
      },
      { status: 500 }
    );
  }
}

function resolvePlanRecord(
  requestId: string,
  body: Partial<GenerateRequest>
): PlanRecord | undefined {
  const savedRecord = getPlan(requestId);

  if (savedRecord) {
    return savedRecord;
  }

  if (!body.draft || !body.plan || typeof body.caption !== "string") {
    return undefined;
  }

  const restoredRecord: PlanRecord = {
    requestId,
    draft: body.draft,
    plan: body.plan,
    caption: body.caption,
    createdAt: Date.now()
  };

  savePlan(restoredRecord);
  return restoredRecord;
}
