import { NextResponse } from "next/server";

import { buildBirthdayEmailHtml, buildBirthdayEmailText } from "@/lib/email-template";
import { getServerEnv } from "@/lib/server-env";
import { EmailSendRequest, EmailSendResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const resendEndpoint = "https://api.resend.com/emails";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as EmailSendRequest;
    const to = input.to?.trim();
    const birthdayName = input.birthdayName?.trim() || "your friend";
    const message = input.message?.trim();
    const videoUrl = input.videoUrl?.trim();

    if (!to || !isEmail(to)) {
      return NextResponse.json(
        { error: "Enter a valid recipient email address." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Add a birthday message before sending the email." },
        { status: 400 }
      );
    }

    if (!videoUrl) {
      return NextResponse.json(
        { error: "Generate the birthday video before sending the email." },
        { status: 400 }
      );
    }

    const apiKey = getServerEnv("RESEND_API_KEY");
    const from =
      getServerEnv("BIRTHDAYBOT_EMAIL_FROM") ||
      getServerEnv("EMAIL_FROM") ||
      "BirthdayBot <onboarding@resend.dev>";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Email is not configured. Set RESEND_API_KEY to send real email." },
        { status: 503 }
      );
    }

    const downloadUrl = buildDownloadUrl(request, videoUrl, birthdayName);
    const enriched = { ...input, downloadUrl };

    const response = await fetch(resendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Happy birthday, ${birthdayName}`,
        text: buildBirthdayEmailText(enriched, birthdayName),
        html: buildBirthdayEmailHtml(enriched, birthdayName)
      })
    });

    const body = (await response.json().catch(() => null)) as
      | (Partial<EmailSendResponse> & { message?: string; error?: string })
      | null;

    if (!response.ok) {
      return NextResponse.json(
        { error: body?.message || body?.error || "Email provider rejected the send." },
        { status: response.status }
      );
    }

    return NextResponse.json({ id: body?.id || "sent" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Email could not be sent."
      },
      { status: 500 }
    );
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildDownloadUrl(
  request: Request,
  videoUrl: string | undefined,
  birthdayName: string
): string | undefined {
  if (!videoUrl) return undefined;

  const base = resolveBaseUrl(request);
  if (!base) return videoUrl;

  const safeName = birthdayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video";

  return `${base}/api/download?url=${encodeURIComponent(videoUrl)}&name=${encodeURIComponent(`birthday-${safeName}.mp4`)}`;
}

function resolveBaseUrl(request: Request): string | undefined {
  const explicit = getServerEnv("BIRTHDAYBOT_PUBLIC_URL");
  if (explicit) return explicit.replace(/\/+$/, "");

  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const vercelUrl = getServerEnv("VERCEL_URL");
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/+$/, "");

  return undefined;
}
