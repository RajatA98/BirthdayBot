// Shared helper for surfacing provider API error details (fal, OpenAI,
// ElevenLabs — anyone returning a structured JSON body on failure). The
// SDKs typically attach `body` + `status` to the thrown Error, and we
// want the actual `detail` string (or FastAPI-style `[{loc,msg,type}]`
// array) in our JobRecord.error, not just "Forbidden" / "Unprocessable
// Entity" from the HTTP statusText.

export function providerFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    const apiError = error as Error & { status?: number; body?: unknown };
    const detail = formatApiErrorBody(apiError.body);
    const baseMessage = apiError.message || "Provider request failed.";

    if (detail && !baseMessage.includes(detail)) {
      return apiError.status
        ? `${baseMessage} (${apiError.status}): ${detail}`
        : `${baseMessage}: ${detail}`;
    }

    return apiError.status && !baseMessage.includes(String(apiError.status))
      ? `${baseMessage} (${apiError.status})`
      : baseMessage;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Provider request failed.";
  }
}

export function formatApiErrorBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;

  const candidate = body as {
    detail?: unknown;
    message?: string;
    error?: string;
  };

  if (Array.isArray(candidate.detail)) {
    const messages = candidate.detail
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const item = entry as { loc?: unknown[]; msg?: unknown };
          const path = Array.isArray(item.loc)
            ? item.loc
                .filter((part) => part !== "body")
                .map((part) => String(part))
                .join(".")
            : undefined;
          const msg = typeof item.msg === "string" ? item.msg : undefined;
          if (path && msg) return `${path}: ${msg}`;
          return msg;
        }
        return undefined;
      })
      .filter((value): value is string => Boolean(value));
    if (messages.length) return messages.join("; ");
  }

  if (typeof candidate.detail === "string") return candidate.detail;
  if (typeof candidate.message === "string") return candidate.message;
  if (typeof candidate.error === "string") return candidate.error;

  return undefined;
}
