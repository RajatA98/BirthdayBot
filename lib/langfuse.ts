import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type LangfuseClient = {
  trace: (...args: unknown[]) => {
    event?: (...eventArgs: unknown[]) => void;
    generation?: (...generationArgs: unknown[]) => {
      end?: (...endArgs: unknown[]) => void;
    };
    update?: (...updateArgs: unknown[]) => void;
  };
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
