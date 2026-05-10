import { NextResponse } from "next/server";

import { getJob } from "@/lib/memory-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (!job.videoUrl) {
      return NextResponse.json(
        { error: "Video is not ready for download yet." },
        { status: 409 }
      );
    }

    const upstream = await fetch(job.videoUrl);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream download failed with status ${upstream.status}.` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "video/mp4";
    const extension = inferExtension(contentType, job.videoUrl);
    const filename = `birthdaybot-video-${jobId}.${extension}`;

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=60"
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

function inferExtension(contentType: string, videoUrl: string) {
  if (contentType.includes("mp4")) {
    return "mp4";
  }

  if (contentType.includes("webm")) {
    return "webm";
  }

  const cleanUrl = videoUrl.split("?")[0] || "";
  const extension = cleanUrl.split(".").pop();
  return extension && extension.length <= 5 ? extension : "mp4";
}
