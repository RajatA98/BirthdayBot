import { DraftRequest } from "@/lib/types";
import { analyzePhoto } from "@/lib/tools/analyze-photo";
import { planBirthdayVideo } from "@/lib/tools/plan-birthday-video";

export async function generatePlanAndCaption(input: DraftRequest) {
  const analysis = await analyzePhoto(input);
  return planBirthdayVideo(input, analysis);
}
