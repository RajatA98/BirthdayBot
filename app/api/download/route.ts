import { NextResponse } from "next/server";

const allowedHostSuffixes = [".fal.ai", ".fal.media", ".fal.run"];

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get("url");
    const requestedName = requestUrl.searchParams.get("name");

    if (!target) {
      return NextResponse.json(
        { error: "Missing url query parameter." },
        { status: 400 }
      );
    }

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(target);
    } catch {
      return NextResponse.json(
        { error: "Invalid url query parameter." },
        { status: 400 }
      );
    }

    if (!isAllowedHost(upstreamUrl.hostname)) {
      return NextResponse.json(
        { error: "Download host is not on the allow-list." },
        { status: 400 }
      );
    }

    const upstream = await fetch(upstreamUrl.toString());

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream download failed with status ${upstream.status}.` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const extension = inferExtension(contentType, upstreamUrl.pathname);
    const safeName = sanitizeDownloadName(requestedName) || `birthdaybot-video.${extension}`;

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, max-age=60",
        "X-AI-Generated": "true",
        "X-AI-Source": "BirthdayBot"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Download failed unexpectedly."
      },
      { status: 500 }
    );
  }
}

function isAllowedHost(hostname: string) {
  const lower = hostname.toLowerCase();

  if (lower === "fal.ai" || lower === "fal.media" || lower === "fal.run") {
    return true;
  }

  return allowedHostSuffixes.some((suffix) => lower.endsWith(suffix));
}

function sanitizeDownloadName(name: string | null) {
  if (!name) return null;
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return cleaned || null;
}

function inferExtension(contentType: string, pathname: string) {
  if (contentType.includes("mp4")) {
    return "mp4";
  }

  if (contentType.includes("webm")) {
    return "webm";
  }

  const extension = pathname.split(".").pop();
  return extension && extension.length <= 5 ? extension : "mp4";
}
