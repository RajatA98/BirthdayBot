import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type AnyArgs = Record<string, unknown>;

export type LangfuseTrace = {
  event?: (args: AnyArgs) => void;
  generation?: (args: AnyArgs) => {
    end?: (args: AnyArgs) => void;
  };
  update?: (args: AnyArgs) => void;
};

type LangfuseClient = {
  trace: (args: AnyArgs) => LangfuseTrace;
  flushAsync?: () => Promise<void>;
};

let client: LangfuseClient | null = null;

export function getLangfuse(): LangfuseClient | null {
  if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
    return null;
  }

  if (!client) {
    const Langfuse = loadLangfuse();

    if (!Langfuse) {
      return null;
    }

    client = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL
    }) as LangfuseClient;
  }

  return client;
}

function loadLangfuse() {
  try {
    const moduleName = ["lang", "fuse"].join("");
    const module = require(moduleName) as {
      Langfuse?: new (...args: unknown[]) => unknown;
    };
    return module.Langfuse;
  } catch {
    return null;
  }
}

type TraceToolOptions<T> = {
  requestId?: string;
  model?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  extractUsage?: (
    result: T
  ) => { input?: number; output?: number } | undefined;
  extractOutput?: (result: T) => unknown;
};

export async function traceTool<T>(
  name: string,
  fn: () => Promise<T>,
  options: TraceToolOptions<T> = {}
): Promise<T> {
  const langfuse = getLangfuse();
  const startedAt = Date.now();

  if (!langfuse) {
    return fn();
  }

  const trace = langfuse.trace({
    name,
    metadata: { requestId: options.requestId, ...options.metadata },
    input: options.input
  });
  const generation = trace?.generation?.({
    name,
    model: options.model,
    input: options.input,
    startTime: new Date(startedAt)
  });

  try {
    const result = await fn();
    const output = options.extractOutput
      ? options.extractOutput(result)
      : result;
    const usage = options.extractUsage?.(result);
    generation?.end?.({
      output,
      usage,
      endTime: new Date()
    });
    trace?.update?.({
      output,
      metadata: { durationMs: Date.now() - startedAt }
    });
    void langfuse.flushAsync?.();
    return result;
  } catch (error) {
    generation?.end?.({
      level: "ERROR",
      statusMessage: error instanceof Error ? error.message : String(error),
      endTime: new Date()
    });
    trace?.update?.({
      metadata: { durationMs: Date.now() - startedAt, error: true }
    });
    void langfuse.flushAsync?.();
    throw error;
  }
}

export function emitTraceEvent(
  name: string,
  metadata?: Record<string, unknown>
) {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  const trace = langfuse.trace({ name });
  trace.event?.({ name, metadata });
  void langfuse.flushAsync?.();
}
