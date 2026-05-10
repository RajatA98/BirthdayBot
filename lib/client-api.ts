import { fal } from "@fal-ai/client";

import {
  DraftRequest,
  GenerateRequest,
  JobCheckRequest,
  JobRecord,
  PlanRecord
} from "@/lib/types";

if (typeof window !== "undefined") {
  fal.config({ proxyUrl: "/api/fal/proxy" });
}

export async function uploadPhotoToFal(file: Blob): Promise<string> {
  return fal.storage.upload(file);
}

export type SuggestPromptInput = {
  photoDataUrl: string;
  photoName?: string;
  birthdayName?: string;
};

export type StudioApi = {
  createPlan(input: DraftRequest): Promise<PlanRecord>;
  startGeneration(input: GenerateRequest): Promise<JobRecord>;
  checkJob(input: JobCheckRequest): Promise<JobRecord>;
  suggestPrompt(input: SuggestPromptInput): Promise<{ suggestion: string }>;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (body?.error) {
      throw new Error(body.error);
    }
    const statusText = response.statusText || "Request failed";
    const hint =
      response.status === 504 || response.status === 408
        ? " The server took too long. Try a smaller photo or try again."
        : response.status === 413
          ? " The photo is too large. Try one under 4 MB."
          : "";
    throw new Error(`${statusText} (status ${response.status}).${hint}`);
  }

  return (await response.json()) as T;
}

export const studioApi: StudioApi = {
  async createPlan(input) {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    return parseJson<PlanRecord>(response);
  },
  async startGeneration(input) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    return parseJson<JobRecord>(response);
  },
  async checkJob(input) {
    const response = await fetch("/api/jobs/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    return parseJson<JobRecord>(response);
  },
  async suggestPrompt(input) {
    const response = await fetch("/api/suggest-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    return parseJson<{ suggestion: string }>(response);
  }
};
