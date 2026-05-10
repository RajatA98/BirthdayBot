import { NextResponse } from "next/server";

import { JobCheckRequest, JobRecord, PlanRecord } from "@/lib/types";
import { resolveJobStatus, startVideoGeneration } from "@/lib/video-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as JobCheckRequest;

    if (!payload?.job || !isValidJobRecord(payload.job)) {
      return NextResponse.json(
        { error: "Job payload is missing or malformed." },
        { status: 400 }
      );
    }

    const job: JobRecord = payload.job;
    const plan: PlanRecord | undefined = isValidPlanRecord(payload.plan)
      ? payload.plan
      : undefined;

    const resolved = await resolveJobStatus(job);
    const merged: JobRecord = { ...job, ...resolved };

    if (resolved.stage === "failed" && job.attempts < 2 && plan) {
      const retrySeed: JobRecord = {
        ...merged,
        attempts: job.attempts + 1,
        stage: "retrying",
        statusMessage:
          "Retrying automatically with a simpler, safer generation strategy.",
        error: undefined,
        providerRequestId: undefined,
        providerEndpoint: undefined,
        videoUrl: undefined,
        createdAt: Date.now()
      };

      try {
        const retried = await startVideoGeneration(plan, retrySeed);
        return NextResponse.json({ ...retrySeed, ...retried });
      } catch (error) {
        console.error("[jobs/check] retry failed:", error);
        return NextResponse.json(retrySeed);
      }
    }

    return NextResponse.json(merged);
  } catch (error) {
    console.error("[jobs/check] status lookup failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Job status lookup failed."
      },
      { status: 500 }
    );
  }
}

function isValidJobRecord(value: unknown): value is JobRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JobRecord>;
  return (
    typeof candidate.jobId === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.stage === "string" &&
    typeof candidate.attempts === "number" &&
    typeof candidate.caption === "string"
  );
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
