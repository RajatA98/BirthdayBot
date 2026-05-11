export type Mode = "simple" | "advanced";

// Photo→video-message occasion identifier. Default is "general" — a
// neutral preset with no holiday seasoning, shaped entirely by the user's
// prompt. "birthday" and "mothers-day" stay as optional presets that bias
// the plan / caption / overlay copy. Adding a new preset is a config entry
// in `lib/occasions.ts` plus a new id here.
export type Occasion = "general" | "birthday" | "mothers-day";

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

export type VoiceMode = "narrate" | "speak-yourself" | "song";

export type SongStyle =
  | "Mariachi"
  | "Bhangra"
  | "Lo-fi"
  | "Gospel"
  | "80s power ballad"
  | "Acoustic";

export type DraftRequest = {
  mode: Mode;
  // HolidayBot routing field. Absent / "birthday" preserves legacy behavior;
  // "mothers-day" swaps captions, voice-over copy, prompt seasoning, and
  // overlay title without forking the pipeline.
  occasion?: Occasion;
  // Legacy field name kept for backward compat with the BirthdayBot UI;
  // for non-birthday occasions this carries the recipient's name (e.g. mom).
  birthdayName?: string;
  prompt: string;
  photoName: string;
  photoDataUrl: string;
  voiceCloneId?: string;
  voiceCloneName?: string;
  voiceSampleName?: string;
  voiceSampleDataUrl?: string;
  voiceSampleClips?: string[];
  voiceConsent?: boolean;
  voiceMode?: VoiceMode;
  userMessageDataUrl?: string;
  songStyle?: SongStyle;
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
  narrationVoiceCue: string;
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
  voiceMode?: VoiceMode;
  logs?: JobLogEntry[];
  createdAt: number;
};

export type PlanResponse = PlanRecord;

export type GenerateResponse = JobRecord;

export type GenerateRequest = PlanRecord & {
  cachedProviderVoiceId?: string;
};

export type JobCheckRequest = {
  job: JobRecord;
  plan: PlanRecord;
};

export type EmailSendRequest = {
  to: string;
  birthdayName: string;
  message: string;
  videoUrl?: string;
  caption?: string;
  downloadUrl?: string;
};

export type EmailSendResponse = {
  id: string;
};
