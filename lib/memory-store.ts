import { JobRecord, PlanRecord } from "@/lib/types";

const planStore = new Map<string, PlanRecord>();
const jobStore = new Map<string, JobRecord>();

export function savePlan(record: PlanRecord) {
  planStore.set(record.requestId, record);
}

export function getPlan(requestId: string) {
  return planStore.get(requestId);
}

export function saveJob(record: JobRecord) {
  jobStore.set(record.jobId, record);
}

export function getJob(jobId: string) {
  return jobStore.get(jobId);
}

export function updateJob(jobId: string, updates: Partial<JobRecord>) {
  const current = jobStore.get(jobId);
  if (!current) {
    return undefined;
  }

  const next = { ...current, ...updates };
  jobStore.set(jobId, next);
  return next;
}
