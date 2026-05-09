import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import { savePlan } from "@/lib/memory-store";
import { generatePlanAndCaption } from "@/lib/plan-service";
import { DraftRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const draft = (await request.json()) as DraftRequest;

    if (!draft.prompt?.trim() || !draft.photoDataUrl) {
      return NextResponse.json(
        { error: "Prompt and photo are required." },
        { status: 400 }
      );
    }

    const generated = await generatePlanAndCaption(draft);
    const record = {
      requestId: makeId("req"),
      draft,
      plan: generated.plan,
      caption: generated.caption,
      createdAt: Date.now()
    };

    savePlan(record);

    return NextResponse.json({
      requestId: record.requestId,
      plan: record.plan,
      caption: record.caption
    });
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
