import { Langfuse } from "langfuse";

let client: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
    return null;
  }

  if (!client) {
    client = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });
  }

  return client;
}
