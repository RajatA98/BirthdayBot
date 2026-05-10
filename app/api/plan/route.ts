import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import { generatePlanAndCaption } from "@/lib/plan-service";
import { DraftRequest, PlanRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const draft = (await request.json()) as DraftRequest;

    if (!draft.prompt?.trim() || !draft.photoDataUrl) {
      return NextResponse.json(
        { error: "Prompt and photo are required." },
        { status: 400 }
      );
    }

    if (
      (draft.voiceSampleDataUrl || draft.voiceSampleClips?.length) &&
      !draft.voiceConsent
    ) {
      return NextResponse.json(
        { error: "Confirm voice-cloning consent before submitting a voice sample." },
        { status: 400 }
      );
    }

    const generated = await generatePlanAndCaption(draft);

    const record: PlanRecord = {
      requestId: makeId("req"),
      draft,
      plan: generated.plan,
      caption: generated.caption,
      createdAt: Date.now()
    };

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Plan generation failed unexpectedly."
      },
      { status: 500 }
    );
  }
}
