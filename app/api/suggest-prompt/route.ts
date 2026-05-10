import { NextResponse } from "next/server";

import { defaultAdvancedSettings } from "@/lib/defaults";
import { suggestPromptFromPhoto } from "@/lib/tools/suggest-prompt";
import { DraftRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type SuggestPromptRequest = {
  photoDataUrl?: string;
  photoName?: string;
  birthdayName?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestPromptRequest;

    if (!body.photoDataUrl) {
      return NextResponse.json(
        { error: "Photo is required to suggest a prompt." },
        { status: 400 }
      );
    }

    const draft: DraftRequest = {
      mode: "simple",
      prompt: "Draft a birthday video prompt suggestion.",
      photoDataUrl: body.photoDataUrl,
      photoName: body.photoName || "suggest-photo.png",
      birthdayName: body.birthdayName,
      advanced: defaultAdvancedSettings
    };

    const suggestion = await suggestPromptFromPhoto(draft);

    return NextResponse.json({ suggestion });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not draft a prompt suggestion."
      },
      { status: 500 }
    );
  }
}
