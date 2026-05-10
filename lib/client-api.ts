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

export type StudioApi = {
  createPlan(input: DraftRequest): Promise<PlanRecord>;
  startGeneration(input: GenerateRequest): Promise<JobRecord>;
  checkJob(input: JobCheckRequest): Promise<JobRecord>;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error || "Request failed.");
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
  }
};
