import { JobRecord, PlanRecord } from "@/lib/types";
import { checkVideoGenerationTool } from "@/lib/tools/check-video-generation";
import { startVideoGenerationTool } from "@/lib/tools/start-video-generation";

export function startVideoGeneration(planRecord: PlanRecord, job: JobRecord) {
  return startVideoGenerationTool(planRecord, job);
}

export function resolveJobStatus(job: JobRecord) {
  return checkVideoGenerationTool(job);
}
