import {
  BirthdayProfileInput,
  BirthdayProfilesResponse,
  BirthdayRunResponse,
  DraftRequest,
  GenerateRequest,
  GenerateResponse,
  JobRecord,
  PlanResponse
} from "@/lib/types";

export type StudioApi = {
  createPlan(input: DraftRequest): Promise<PlanResponse>;
  startGeneration(input: GenerateRequest): Promise<GenerateResponse>;
  getJob(jobId: string): Promise<JobRecord>;
  listBirthdayProfiles(): Promise<BirthdayProfilesResponse>;
  createBirthdayProfile(input: BirthdayProfileInput): Promise<BirthdayProfilesResponse>;
  runBirthdayAutomation(date?: string): Promise<BirthdayRunResponse>;
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
  async startGeneration(input) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    return parseJson<GenerateResponse>(response);
  },
  async getJob(jobId) {
    const response = await fetch(`/api/jobs/${jobId}`);
    return parseJson<JobRecord>(response);
  },
  async listBirthdayProfiles() {
    const response = await fetch("/api/birthdays");
    return parseJson<BirthdayProfilesResponse>(response);
  },
  async createBirthdayProfile(input) {
    const response = await fetch("/api/birthdays", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    return parseJson<BirthdayProfilesResponse>(response);
  },
  async runBirthdayAutomation(date) {
    const response = await fetch("/api/birthdays/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(date ? { date } : {})
    });

    return parseJson<BirthdayRunResponse>(response);
  }
};
