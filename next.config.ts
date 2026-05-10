import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/generate": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/jobs/[jobId]": ["./node_modules/ffmpeg-static/ffmpeg"]
  }
};

export default nextConfig;
