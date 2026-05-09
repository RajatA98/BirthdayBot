import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import { getPlan, saveJob, updateJob } from "@/lib/memory-store";
import { JobRecord } from "@/lib/types";
import { startVideoGeneration } from "@/lib/video-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { requestId?: string };
    const requestId = body.requestId;

    if (!requestId) {
      return NextResponse.json(
        { error: "requestId is required." },
        { status: 400 }
      );
    }

    const planRecord = getPlan(requestId);

    if (!planRecord) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
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
    } catch {
      updateJob(initialJob.jobId, {
        stage: "retrying",
        statusMessage: "Provider startup failed, falling back to local demo flow."
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
