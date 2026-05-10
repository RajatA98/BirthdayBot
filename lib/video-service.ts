import { JobRecord, PlanRecord } from "@/lib/types";
import { buildFalInput, buildFalPrompt } from "@/lib/tools/build-video-input";
import { checkVideoGenerationTool } from "@/lib/tools/check-video-generation";
import { startVideoGenerationTool } from "@/lib/tools/start-video-generation";

export { buildFalInput, buildFalPrompt };

export function startVideoGeneration(planRecord: PlanRecord, job: JobRecord) {
  return startVideoGenerationTool(planRecord, job);
}

export function resolveJobStatus(job: JobRecord) {
  return checkVideoGenerationTool(job);
}
