import { JobRecord, PlanRecord } from "@/lib/types";

type StoreState = {
  plans: Map<string, PlanRecord>;
  jobs: Map<string, JobRecord>;
};

const store = getStore();
const planStore = store.plans;
const jobStore = store.jobs;

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    __birthdayBotMemoryStore?: StoreState;
  };

  globalStore.__birthdayBotMemoryStore ??= {
    plans: new Map<string, PlanRecord>(),
    jobs: new Map<string, JobRecord>()
  };

  return globalStore.__birthdayBotMemoryStore;
}

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
