import { NextResponse } from "next/server";

import { makeId } from "@/lib/id";
import {
  listBirthdayDeliveries,
  listBirthdayProfiles,
  saveBirthdayProfile
} from "@/lib/memory-store";
import { BirthdayProfile, BirthdayProfileInput } from "@/lib/types";

export async function GET() {
  return NextResponse.json({
    profiles: listBirthdayProfiles(),
    deliveries: listBirthdayDeliveries()
  });
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as BirthdayProfileInput;
    const error = validateBirthdayProfile(input);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const now = Date.now();
    const profile: BirthdayProfile = {
      id: makeId("bday"),
      name: input.name.trim(),
      relationship: input.relationship.trim(),
      birthday: input.birthday,
      customPrompt: input.customPrompt.trim() || defaultPrompt(input),
      deliveryEmail: input.deliveryEmail.trim(),
      photoName: input.photoName,
      photoDataUrl: input.photoDataUrl,
      autoSend: input.autoSend,
      createdAt: now,
      updatedAt: now
    };

    saveBirthdayProfile(profile);

    return NextResponse.json({
      profiles: listBirthdayProfiles(),
      deliveries: listBirthdayDeliveries()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Birthday profile could not be saved."
      },
      { status: 500 }
    );
  }
}

function validateBirthdayProfile(input: BirthdayProfileInput) {
  if (!input.name?.trim()) {
    return "Name is required.";
  }

  if (!input.relationship?.trim()) {
    return "Relationship is required.";
  }

  if (!isValidBirthday(input.birthday)) {
    return "Birthday must be a valid date.";
  }

  if (!input.deliveryEmail?.includes("@")) {
    return "Delivery email is required.";
  }

  if (!input.photoDataUrl || !input.photoName) {
    return "Add a photo for this birthday video.";
  }

  return "";
}

function isValidBirthday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function defaultPrompt(input: BirthdayProfileInput) {
  return `Create a warm birthday celebration video for ${input.name.trim()}, my ${input.relationship.trim()}, with embedded on-screen birthday text and uplifting music in the video.`;
}
