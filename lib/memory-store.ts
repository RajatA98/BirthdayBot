import fs from "node:fs";
import path from "node:path";

import { JobRecord, PlanRecord } from "@/lib/types";

const rootDir = path.join(process.cwd(), ".tmp", "birthdaybot-store");
const plansDir = path.join(rootDir, "plans");
const jobsDir = path.join(rootDir, "jobs");

export function savePlan(record: PlanRecord) {
  ensureDir(plansDir);
  fs.writeFileSync(
    planPath(record.requestId),
    JSON.stringify(sanitizePlanRecord(record), null, 2),
    "utf8"
  );
}

export function getPlan(requestId: string) {
  return readJson<PlanRecord>(planPath(requestId));
}

export function saveJob(record: JobRecord) {
  ensureDir(jobsDir);
  fs.writeFileSync(jobPath(record.jobId), JSON.stringify(record, null, 2), "utf8");
}

export function getJob(jobId: string) {
  return readJson<JobRecord>(jobPath(jobId));
}

export function updateJob(jobId: string, updates: Partial<JobRecord>) {
  const current = getJob(jobId);

  if (!current) {
    return undefined;
  }

  const next = { ...current, ...updates };
  saveJob(next);
  return next;
}

function sanitizePlanRecord(record: PlanRecord): PlanRecord {
  return {
    ...record,
    draft: {
      ...record.draft,
      voiceSampleDataUrl: undefined,
      voiceSampleClips: undefined,
      voiceConsent: undefined
    }
  };
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function planPath(requestId: string) {
  return path.join(plansDir, `${requestId}.json`);
}

function jobPath(jobId: string) {
  return path.join(jobsDir, `${jobId}.json`);
}

function readJson<T>(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
