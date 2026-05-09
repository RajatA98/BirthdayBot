import { NextResponse } from "next/server";

import { getJob, getPlan, updateJob } from "@/lib/memory-store";
import { resolveJobStatus } from "@/lib/video-service";
import { startVideoGeneration } from "@/lib/video-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const resolved = await resolveJobStatus(job);

    if (resolved.stage === "failed" && job.attempts < 2) {
      const planRecord = getPlan(job.requestId);

      if (planRecord) {
        const retrySeed = updateJob(jobId, {
          attempts: job.attempts + 1,
          stage: "retrying",
          statusMessage:
            "Retrying automatically with a simpler, safer generation strategy.",
          error: undefined,
          providerRequestId: undefined,
          providerEndpoint: undefined,
          createdAt: Date.now()
        });

        if (retrySeed) {
          try {
            const retried = await startVideoGeneration(planRecord, retrySeed);
            const resumed = updateJob(jobId, retried);
            return NextResponse.json(resumed ?? retrySeed);
          } catch {
            return NextResponse.json(retrySeed);
          }
        }
      }
    }

    const updated = updateJob(jobId, resolved);

    return NextResponse.json(updated ?? job);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Job status lookup failed."
      },
      { status: 500 }
    );
  }
}
