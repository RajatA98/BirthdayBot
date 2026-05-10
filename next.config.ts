import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  // The mux step runs inside /api/jobs/check (called from the client poll),
  // so the ffmpeg binary must travel with that function on Vercel. Without
  // this include the binary is missing in the Lambda, mux throws "ffmpeg
  // binary is not available", and the result falls back to the raw fal MP4
  // + a separate <audio> overlay (which is what the user perceives as
  // double audio + missing voice on download).
  outputFileTracingIncludes: {
    "/api/generate": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/jobs/check": ["./node_modules/ffmpeg-static/ffmpeg"]
  }
};

export default nextConfig;
