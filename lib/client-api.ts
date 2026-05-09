import {
  DraftRequest,
  GenerateResponse,
  JobRecord,
  PlanResponse
} from "@/lib/types";

export type StudioApi = {
  createPlan(input: DraftRequest): Promise<PlanResponse>;
  startGeneration(requestId: string): Promise<GenerateResponse>;
  getJob(jobId: string): Promise<JobRecord>;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Request failed.");
  }

  return (await response.json()) as T;
}

export const studioApi: StudioApi = {
  async createPlan(input) {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    return parseJson<PlanResponse>(response);
  },
  async startGeneration(requestId) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requestId })
    });

    return parseJson<GenerateResponse>(response);
  },
  async getJob(jobId) {
    const response = await fetch(`/api/jobs/${jobId}`);
    return parseJson<JobRecord>(response);
  }
};
