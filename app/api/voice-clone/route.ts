import { NextResponse } from "next/server";

import { getVoiceClone, saveVoiceClone } from "@/lib/memory-store";
import { createAccountVoiceClone } from "@/lib/video-service";

export const runtime = "nodejs";

type VoiceCloneRequest = {
  voiceSampleName?: string;
  voiceSampleDataUrl?: string;
  voiceConsent?: boolean;
};

export async function GET() {
  const clone = getVoiceClone();

  return NextResponse.json({
    ready: Boolean(clone),
    voiceCloneId: clone?.providerVoiceId,
    voiceCloneName: clone?.sampleName,
    createdAt: clone?.createdAt
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceCloneRequest;

    if (!body.voiceSampleName || !body.voiceSampleDataUrl) {
      return NextResponse.json(
        { error: "Voice sample is required." },
        { status: 400 }
      );
    }

    if (!body.voiceConsent) {
      return NextResponse.json(
        { error: "Confirm voice-cloning consent before submitting a voice sample." },
        { status: 400 }
      );
    }

    const providerVoiceId = await createAccountVoiceClone({
      voiceSampleName: body.voiceSampleName,
      voiceSampleDataUrl: body.voiceSampleDataUrl,
      voiceConsent: body.voiceConsent
    });
    const record = {
      providerVoiceId,
      sampleName: body.voiceSampleName,
      createdAt: Date.now()
    };

    saveVoiceClone(record);

    return NextResponse.json({
      ready: true,
      voiceCloneId: record.providerVoiceId,
      voiceCloneName: record.sampleName,
      createdAt: record.createdAt
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Voice clone could not be created."
      },
      { status: 500 }
    );
  }
}
