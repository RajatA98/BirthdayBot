import {
  BirthdayDelivery,
  BirthdayProfile,
  JobRecord,
  PlanRecord
} from "@/lib/types";

type StoreState = {
  plans: Map<string, PlanRecord>;
  jobs: Map<string, JobRecord>;
  birthdayProfiles: Map<string, BirthdayProfile>;
  birthdayDeliveries: Map<string, BirthdayDelivery>;
};

const store = getStore();
const planStore = store.plans;
const jobStore = store.jobs;
const birthdayProfileStore = store.birthdayProfiles;
const birthdayDeliveryStore = store.birthdayDeliveries;

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    __birthdayBotMemoryStore?: StoreState;
  };

  globalStore.__birthdayBotMemoryStore ??= {
    plans: new Map<string, PlanRecord>(),
    jobs: new Map<string, JobRecord>(),
    birthdayProfiles: new Map<string, BirthdayProfile>(),
    birthdayDeliveries: new Map<string, BirthdayDelivery>()
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

export function saveBirthdayProfile(record: BirthdayProfile) {
  birthdayProfileStore.set(record.id, record);
}

export function listBirthdayProfiles() {
  return Array.from(birthdayProfileStore.values()).sort((left, right) =>
    nextBirthdayTime(left.birthday) - nextBirthdayTime(right.birthday)
  );
}

export function updateBirthdayProfile(
  profileId: string,
  updates: Partial<BirthdayProfile>
) {
  const current = birthdayProfileStore.get(profileId);
  if (!current) {
    return undefined;
  }

  const next = { ...current, ...updates, updatedAt: Date.now() };
  birthdayProfileStore.set(profileId, next);
  return next;
}

export function listDueBirthdayProfiles(date = new Date()) {
  const monthDay = birthdayMonthDay(date);
  return listBirthdayProfiles().filter((profile) => {
    if (!profile.autoSend) {
      return false;
    }

    if (profile.lastGeneratedYear === date.getFullYear()) {
      return false;
    }

    return profile.birthday.slice(5) === monthDay;
  });
}

export function saveBirthdayDelivery(record: BirthdayDelivery) {
  birthdayDeliveryStore.set(record.id, record);
}

export function listBirthdayDeliveries() {
  return Array.from(birthdayDeliveryStore.values()).sort(
    (left, right) => right.createdAt - left.createdAt
  );
}

function birthdayMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function nextBirthdayTime(birthday: string) {
  const now = new Date();
  const [month, day] = birthday.slice(5).split("-").map(Number);
  const next = new Date(now.getFullYear(), month - 1, day);

  if (next < startOfToday(now)) {
    next.setFullYear(now.getFullYear() + 1);
  }

  return next.getTime();
}

function startOfToday(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
