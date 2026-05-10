import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import { GenerateRequest, JobRecord, PlanRecord } from "@/lib/types";
import { startVideoGeneration } from "@/lib/video-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;

    if (!isValidPlanRecord(body)) {
      return NextResponse.json(
        {
          error:
            "Plan payload is incomplete. Build the birthday brief again before starting generation."
        },
        { status: 400 }
      );
    }

    const planRecord: PlanRecord = body;
    const cachedProviderVoiceId =
      typeof body.cachedProviderVoiceId === "string"
        ? body.cachedProviderVoiceId
        : undefined;

    const initialJob: JobRecord = {
      jobId: makeId("job"),
      requestId: planRecord.requestId,
      stage: "queued",
      statusMessage: "Queued and preparing the creative brief.",
      attempts: 1,
      caption: planRecord.caption,
      providerVoiceId: cachedProviderVoiceId,
      createdAt: Date.now()
    };

    try {
      const providerJob = await startVideoGeneration(planRecord, initialJob);
      return NextResponse.json({ ...initialJob, ...providerJob });
    } catch (err) {
      console.error(
        "[generate] startVideoGeneration failed:",
        JSON.stringify(err, null, 2)
      );
      return NextResponse.json({
        ...initialJob,
        stage: "failed",
        statusMessage: "Video generation could not be started.",
        error:
          err instanceof Error
            ? err.message
            : "Provider startup failed before a video job was created."
      });
    }
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

function isValidPlanRecord(value: unknown): value is PlanRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlanRecord>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.caption === "string" &&
    Boolean(candidate.draft) &&
    Boolean(candidate.plan)
  );
}
