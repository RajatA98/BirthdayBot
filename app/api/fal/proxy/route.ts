import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";

export const runtime = "nodejs";

export const { GET, POST, PUT } = createRouteHandler();
