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
  prompt: string;
  photoName: string;
  photoDataUrl: string;
  voiceSampleName?: string;
  voiceSampleDataUrl?: string;
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

export type JobRecord = {
  jobId: string;
  requestId: string;
  stage: JobStage;
  statusMessage: string;
  attempts: number;
  videoUrl?: string;
  voiceOverUrl?: string;
  caption: string;
  error?: string;
  providerRequestId?: string;
  providerEndpoint?: string;
  providerVoiceId?: string;
  voiceOverError?: string;
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

export type BirthdayProfile = {
  id: string;
  name: string;
  relationship: string;
  birthday: string;
  customPrompt: string;
  deliveryEmail: string;
  photoName: string;
  photoDataUrl: string;
  autoSend: boolean;
  lastGeneratedYear?: number;
  createdAt: number;
  updatedAt: number;
};

export type BirthdayProfileInput = {
  name: string;
  relationship: string;
  birthday: string;
  customPrompt: string;
  deliveryEmail: string;
  photoName: string;
  photoDataUrl: string;
  autoSend: boolean;
};

export type BirthdayDeliveryStatus =
  | "queued"
  | "generating"
  | "ready"
  | "failed";

export type BirthdayDelivery = {
  id: string;
  profileId: string;
  profileName: string;
  scheduledFor: string;
  deliveryEmail: string;
  requestId?: string;
  jobId?: string;
  status: BirthdayDeliveryStatus;
  error?: string;
  createdAt: number;
};

export type BirthdayProfilesResponse = {
  profiles: BirthdayProfile[];
  deliveries: BirthdayDelivery[];
};

export type BirthdayRunResponse = {
  date: string;
  generated: BirthdayDelivery[];
  skipped: Array<{
    profileId: string;
    profileName: string;
    reason: string;
  }>;
};
