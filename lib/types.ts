export type Mode = "simple" | "advanced";

export type AdvancedSettings = {
  tone: string;
  sceneIdea: string;
  videoLength: string;
  aspectRatio: string;
  captionStyle: string;
  musicVibe: string;
  motionIntensity: string;
  agentGoalMode: string;
};

export type DraftRequest = {
  mode: Mode;
  birthdayName?: string;
  prompt: string;
  photoName: string;
  photoDataUrl: string;
  voiceSampleName?: string;
  voiceSampleDataUrl?: string;
  voiceSampleClips?: string[];
  voiceConsent?: boolean;
  advanced: AdvancedSettings;
};

export type AgentPlan = {
  title: string;
  concept: string;
  vibe: string;
  sceneDirection: string;
  motionDirection: string;
  captionApproach: string;
  generationStrategy: string;
  keepFromPhoto: string[];
  surpriseFactor: string;
  subjectCount: number;
  identityAnchors: string[];
  sceneGuardrails: string[];
  safePrompt: string;
  negativePrompt: string;
};

export type PhotoAnalysis = {
  subjectCount: number;
  identityAnchors: string[];
  clothingAnchors: string[];
  compositionAnchors: string[];
  mood: string;
  sceneSummary: string;
};

export type PlanRecord = {
  requestId: string;
  draft: DraftRequest;
  plan: AgentPlan;
  caption: string;
  createdAt: number;
};

export type JobStage =
  | "queued"
  | "analyzing"
  | "writing"
  | "generating"
  | "retrying"
  | "finalizing"
  | "completed"
  | "failed";

export type JobLogEntry = {
  message: string;
  timestamp: number;
  source?: "provider" | "system";
};

export type JobRecord = {
  jobId: string;
  requestId: string;
  stage: JobStage;
  statusMessage: string;
  attempts: number;
  videoUrl?: string;
  voiceOverUrl?: string;
  musicBedUrl?: string;
  caption: string;
  error?: string;
  providerRequestId?: string;
  providerEndpoint?: string;
  providerVoiceId?: string;
  targetDurationSeconds?: number;
  voiceOverError?: string;
  logs?: JobLogEntry[];
  createdAt: number;
};

export type PlanResponse = {
  requestId: string;
  plan: AgentPlan;
  caption: string;
};

export type GenerateResponse = {
  jobId: string;
};

export type GenerateRequest = {
  requestId: string;
  draft?: DraftRequest;
  plan?: AgentPlan;
  caption?: string;
};
