import { analyzePhoto } from "@/lib/tools/analyze-photo";
import { planBirthdayVideo } from "@/lib/tools/plan-birthday-video";
import { defaultAdvancedSettings } from "@/lib/defaults";

describe("core tools", () => {
  const draft = {
    mode: "simple" as const,
    // This suite exercises the birthday plan path specifically; the default
    // occasion flipped from "birthday" → "general" in the pivot.
    occasion: "birthday" as const,
    prompt: "make this a warm birthday celebration",
    photoName: "test.png",
    photoDataUrl: "data:image/png;base64,abc",
    advanced: defaultAdvancedSettings
  };

  it("analyze_photo returns subject and scene anchors", async () => {
    const analysis = await analyzePhoto(draft);

    expect(analysis.subjectCount).toBeGreaterThan(0);
    expect(analysis.identityAnchors.length).toBeGreaterThan(0);
    expect(analysis.compositionAnchors.length).toBeGreaterThan(0);
  });

  it("plan_birthday_video creates a director-style safe prompt", async () => {
    const analysis = await analyzePhoto(draft);
    const planned = await planBirthdayVideo(draft, analysis);

    expect(planned.plan.safePrompt).toContain("Direct this like a premium birthday short film");
    expect(planned.plan.safePrompt).toContain("Scene:");
    expect(planned.plan.safePrompt).toContain("Subject motion:");
    expect(planned.plan.safePrompt).toContain("Camera:");
    expect(planned.plan.safePrompt).toContain("Lighting:");
    expect(planned.plan.safePrompt).toContain("Constraints:");
    expect(planned.plan.subjectCount).toBe(analysis.subjectCount);
    expect(planned.plan.identityAnchors).toEqual(analysis.identityAnchors);
    expect(planned.plan.negativePrompt).toContain("No extra people");
  });
});
