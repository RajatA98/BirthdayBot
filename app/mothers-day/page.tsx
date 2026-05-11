"use client";

import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";

import { studioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { getOccasionConfig } from "@/lib/occasions";
import { AgentPlan, DraftRequest, JobRecord, PlanRecord } from "@/lib/types";

// HolidayBot — Mother's Day studio
//
// Slimmer than the BirthdayBot 5-step wizard:
//   1) Photo + recipient name + card swatch
//   2) Prompt + voice mode + voice-clone setup (shared with BirthdayBot)
//   3) Brief preview + Generate
//
// The voice-clone storage key is intentionally the same as BirthdayBot's
// (`birthdaybot:new-ui-voice-setup`) — one voice clone serves every
// occasion the user creates from this account.

const occasionConfig = getOccasionConfig("mothers-day");
const swatches = ["lavender", "pink", "coral", "lime", "yellow"] as const;
type Swatch = (typeof swatches)[number];

const voiceSetupStorageKey = "birthdaybot:new-ui-voice-setup";

type VoiceCloneState = {
  ready: boolean;
  voiceCloneName?: string;
  voiceSampleName?: string;
  voiceSampleDataUrl?: string;
  providerVoiceId?: string;
  createdAt?: number;
};

type GenerationState = {
  phase: "idle" | "planning" | "generating" | "completed" | "failed";
  message: string;
  requestId?: string;
  plan?: AgentPlan;
  caption?: string;
  job?: JobRecord;
  videoUrl?: string;
  voiceOverUrl?: string;
  error?: string;
};

type Draft = {
  recipientName: string;
  prompt: string;
  photoName: string;
  photoDataUrl: string;
  swatch: Swatch;
};

function blankDraft(): Draft {
  return {
    recipientName: "",
    prompt: "",
    photoName: "",
    photoDataUrl: "",
    swatch: "lavender"
  };
}

export default function MothersDayPage() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [voiceClone, setVoiceClone] = useState<VoiceCloneState>({ ready: false });
  const [briefPlan, setBriefPlan] = useState<AgentPlan | null>(null);
  const [briefCaption, setBriefCaption] = useState("");
  const [briefRequestId, setBriefRequestId] = useState("");
  const [briefDraft, setBriefDraft] = useState<DraftRequest | null>(null);
  const [briefError, setBriefError] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [generation, setGeneration] = useState<GenerationState>({
    phase: "idle",
    message: "Build the brief, then generate."
  });

  useEffect(() => {
    const saved = readVoiceSetup();
    if (saved?.ready) setVoiceClone(saved);
  }, []);

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function loadBrief() {
    if (!draft.photoDataUrl) {
      setBriefError("Upload a photo on the previous step first.");
      return;
    }
    if (!draft.prompt.trim()) {
      setBriefError("Add a prompt on the previous step first.");
      return;
    }

    setBriefLoading(true);
    setBriefError("");

    try {
      const requestDraft = buildMothersDayDraftRequest(draft, voiceClone);
      const planRecord = await studioApi.createPlan(requestDraft);
      setBriefDraft(requestDraft);
      setBriefPlan(planRecord.plan);
      setBriefCaption(planRecord.caption);
      setBriefRequestId(planRecord.requestId);
    } catch (error) {
      setBriefError(
        error instanceof Error ? error.message : "Could not build the brief."
      );
    } finally {
      setBriefLoading(false);
    }
  }

  async function generateVideo() {
    if (!briefPlan || !briefDraft) {
      setGeneration({
        phase: "failed",
        message: "Build the brief first.",
        error: "Open the Brief step and let it load before generating."
      });
      return;
    }

    try {
      setGeneration({
        phase: "planning",
        message: "Sending the brief to the video model."
      });

      const planRecord: PlanRecord = {
        requestId: briefRequestId,
        draft: briefDraft,
        plan: briefPlan,
        caption: briefCaption,
        createdAt: Date.now()
      };

      const job = await studioApi.startGeneration({
        ...planRecord,
        cachedProviderVoiceId: voiceClone.providerVoiceId
      });

      const handleJob = (next: JobRecord) => {
        if (next.providerVoiceId) {
          setVoiceClone((current) =>
            saveVoiceSetup({ ...current, providerVoiceId: next.providerVoiceId })
          );
        }
        setGeneration({
          phase:
            next.stage === "completed"
              ? "completed"
              : next.stage === "failed"
                ? "failed"
                : "generating",
          message: next.statusMessage,
          requestId: planRecord.requestId,
          plan: briefPlan,
          caption: next.caption || briefCaption,
          job: next,
          videoUrl: next.videoUrl,
          voiceOverUrl: next.voiceOverUrl,
          error: next.error || next.voiceOverError
        });
      };

      handleJob(job);

      if (job.stage !== "completed" && job.stage !== "failed") {
        await pollGenerationJob(job, planRecord, handleJob);
      }
    } catch (error) {
      setGeneration({
        phase: "failed",
        message: "Video generation could not be started.",
        error: error instanceof Error ? error.message : "Unknown error."
      });
    }
  }

  return (
    <main className="bb-app md-shell">
      <header className="md-topbar">
        <a className="bb-text-button" href="/">
          ← Back to BirthdayBot
        </a>
        <span className="md-eyebrow">HolidayBot · Mother&apos;s Day</span>
      </header>

      <section className="md-stage">
        <header className="md-hero">
          <p className="bb-kicker">{occasionConfig.label}</p>
          <h1>
            Make a <mark className="lavender">Mother&apos;s Day</mark> postcard for someone who deserves it.
          </h1>
          <p>
            Same engine as BirthdayBot, retuned for moms — gentler scenes, a
            tender voice-over, and a &quot;{occasionConfig.greeting}&quot; overlay
            instead of party confetti.
          </p>
        </header>

        <ol className="md-stepper">
          {["Photo", "Prompt + voice", "Brief & generate"].map((label, index) => (
            <li
              key={label}
              className={
                index < step
                  ? "is-done"
                  : index === step
                    ? "is-active"
                    : ""
              }
            >
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>

        <div className="md-body">
          {step === 0 ? (
            <StepPhoto draft={draft} update={update} onNext={() => setStep(1)} />
          ) : null}
          {step === 1 ? (
            <StepPrompt
              draft={draft}
              update={update}
              voiceClone={voiceClone}
              onVoiceCloneReady={setVoiceClone}
              onBack={() => setStep(0)}
              onNext={() => {
                setStep(2);
                if (!briefPlan && !briefLoading) void loadBrief();
              }}
            />
          ) : null}
          {step === 2 ? (
            <StepBrief
              plan={briefPlan}
              caption={briefCaption}
              loading={briefLoading}
              error={briefError}
              onPlanChange={setBriefPlan}
              onCaptionChange={setBriefCaption}
              onLoad={loadBrief}
              generation={generation}
              voiceClone={voiceClone}
              draft={draft}
              onBack={() => setStep(1)}
              onGenerate={generateVideo}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function StepPhoto({
  draft,
  update,
  onNext
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
}) {
  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    update({
      photoName: file.name,
      photoDataUrl: await fileToDataUrl(file)
    });
  }

  const ready = Boolean(draft.photoDataUrl) && Boolean(draft.recipientName.trim());

  return (
    <section className="md-panel">
      <h2>Step 1 · The face of the day</h2>
      <p>Upload a photo of the mom you&apos;re celebrating, plus the name we should put on the card.</p>

      <div className="md-photo-row">
        <label className={`bb-dropzone md-dropzone ${draft.photoDataUrl ? "has-photo" : ""}`}>
          <input type="file" accept="image/*" onChange={onPhotoChange} />
          {draft.photoDataUrl ? (
            <>
              <img src={draft.photoDataUrl} alt="" />
              <span className="bb-file-pill">{draft.photoName}</span>
              <strong>Replace</strong>
            </>
          ) : (
            <span className="bb-drop-empty">
              <strong>Drop a photo here</strong>
              <small>or click to choose · jpg, png, heic up to 20MB</small>
            </span>
          )}
        </label>

        <aside className="md-form">
          <Field label="Their name">
            <input
              value={draft.recipientName}
              onChange={(e) => update({ recipientName: e.target.value })}
              placeholder="Mom · Mama · Grandma · Stepmom · …"
            />
          </Field>
          <Field label="Card color">
            <div className="bb-color-picker">
              {swatches.map((swatch) => (
                <button
                  key={swatch}
                  className={`swatch-${swatch} ${draft.swatch === swatch ? "is-active" : ""}`}
                  aria-label={swatch}
                  onClick={() => update({ swatch })}
                />
              ))}
            </div>
          </Field>
          <p className="md-tip">
            Tip — front-facing photos with even lighting work best. We&apos;ll preserve her face,
            hair, and outfit cues exactly as they appear.
          </p>
        </aside>
      </div>

      <div className="md-step-actions">
        <span />
        <button
          className="bb-sticker-button"
          onClick={onNext}
          disabled={!ready}
        >
          Next: prompt + voice
        </button>
      </div>
    </section>
  );
}

function StepPrompt({
  draft,
  update,
  voiceClone,
  onVoiceCloneReady,
  onBack,
  onNext
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  voiceClone: VoiceCloneState;
  onVoiceCloneReady: (clone: VoiceCloneState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ready = draft.prompt.trim().length > 0;

  return (
    <section className="md-panel">
      <h2>Step 2 · Prompt + voice</h2>
      <p>Describe the moment in your own words, or pick a starting point and tweak it.</p>

      <div className="md-suggestions">
        {occasionConfig.promptSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="md-chip"
            onClick={() => update({ prompt: suggestion })}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <Field label="Prompt" hint={`${draft.prompt.length} / 500`}>
        <textarea
          value={draft.prompt}
          maxLength={500}
          rows={5}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="A quiet golden-hour kitchen moment with mom laughing, a cup of tea in her hands."
        />
      </Field>

      <div className="md-voice-block">
        {voiceClone.ready ? (
          <section className="bb-voice-ready-card">
            <span className="bb-card-heading">Account voice</span>
            <strong>Voice clone ready</strong>
            <small>
              {voiceClone.voiceCloneName || "Saved voice"} will narrate the
              video — same voice you use for birthdays, no need to re-record.
            </small>
            <button
              className="bb-outline-button"
              onClick={() => onVoiceCloneReady({ ready: false })}
            >
              Re-record voice
            </button>
          </section>
        ) : (
          <VoiceSetupCard onReady={onVoiceCloneReady} />
        )}
      </div>

      <div className="md-step-actions">
        <button className="bb-text-button" onClick={onBack}>
          ← Back
        </button>
        <button
          className="bb-sticker-button"
          onClick={onNext}
          disabled={!ready}
        >
          Build the brief
        </button>
      </div>
    </section>
  );
}

function StepBrief({
  plan,
  caption,
  loading,
  error,
  onPlanChange,
  onCaptionChange,
  onLoad,
  generation,
  voiceClone,
  draft,
  onBack,
  onGenerate
}: {
  plan: AgentPlan | null;
  caption: string;
  loading: boolean;
  error: string;
  onPlanChange: (plan: AgentPlan) => void;
  onCaptionChange: (caption: string) => void;
  onLoad: () => void;
  generation: GenerationState;
  voiceClone: VoiceCloneState;
  draft: Draft;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const isGenerating =
    generation.phase === "planning" || generation.phase === "generating";

  if (loading) {
    return (
      <section className="md-panel">
        <h2>Drafting the brief…</h2>
        <p>Hang on — building a Mother&apos;s Day plan from your prompt.</p>
        <div className="bb-brief-loading">Working on it…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="md-panel">
        <h2>Couldn&apos;t build the brief.</h2>
        <p>{error}</p>
        <button className="bb-sticker-button" onClick={onLoad}>
          Try again
        </button>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="md-panel">
        <h2>Step 3 · Brief & generate</h2>
        <p>Tap below to draft a Mother&apos;s Day brief from your prompt.</p>
        <button className="bb-sticker-button" onClick={onLoad}>
          Build the brief
        </button>
      </section>
    );
  }

  function field<K extends keyof AgentPlan>(key: K, value: AgentPlan[K]) {
    if (!plan) return;
    onPlanChange({ ...plan, [key]: value });
  }

  return (
    <section className="md-panel">
      <h2>Step 3 · Brief & generate</h2>
      <p>Edit any of these before generation. Identity guardrails stay locked.</p>

      <div className="md-brief-grid">
        <div className="md-brief-fields">
          <Field label="Title">
            <input value={plan.title} onChange={(e) => field("title", e.target.value)} />
          </Field>
          <Field label="Concept">
            <textarea
              value={plan.concept}
              rows={2}
              onChange={(e) => field("concept", e.target.value)}
            />
          </Field>
          <Field label="Mother's Day message" hint={`${caption.length} chars`}>
            <textarea
              value={caption}
              rows={3}
              onChange={(e) => onCaptionChange(e.target.value)}
            />
          </Field>
          <Field label="Vibe">
            <textarea
              value={plan.vibe}
              rows={2}
              onChange={(e) => field("vibe", e.target.value)}
            />
          </Field>
          <Field label="Scene direction">
            <textarea
              value={plan.sceneDirection}
              rows={3}
              onChange={(e) => field("sceneDirection", e.target.value)}
            />
          </Field>
          <Field label="Motion direction">
            <textarea
              value={plan.motionDirection}
              rows={2}
              onChange={(e) => field("motionDirection", e.target.value)}
            />
          </Field>
        </div>

        <aside className="md-preview">
          <div className={`bb-postcard swatch-${draft.swatch} is-preview`}>
            {generation.videoUrl ? (
              <video controls playsInline src={generation.videoUrl} className="bb-generated-video" />
            ) : draft.photoDataUrl ? (
              <img src={draft.photoDataUrl} alt="" className="md-preview-photo" />
            ) : null}
            <div className="md-overlay">
              <strong>
                {occasionConfig.greeting}
                {draft.recipientName.trim() ? `, ${draft.recipientName.trim()}` : ""}
              </strong>
            </div>
          </div>
          <section className={`bb-generation-card is-${generation.phase}`}>
            <span className="bb-card-heading">Video output</span>
            <strong>
              {generation.phase === "completed"
                ? "Mother's Day video is ready 💐"
                : generation.phase === "failed"
                  ? "Needs attention"
                  : "Generate video"}
            </strong>
            <small>{generation.error || generation.message}</small>
            {generation.videoUrl ? (
              <a
                className="bb-sticker-button"
                href={`/api/download?url=${encodeURIComponent(generation.videoUrl)}&name=mothers-day-${draft.recipientName.trim().toLowerCase().replace(/\s+/g, "-") || "video"}.mp4`}
              >
                Download video
              </a>
            ) : null}
            <button
              className={
                generation.videoUrl ? "bb-outline-button" : "bb-sticker-button"
              }
              onClick={onGenerate}
              disabled={isGenerating}
            >
              {isGenerating
                ? "Generating…"
                : generation.videoUrl
                  ? "Generate again"
                  : `Make my Mother's Day video`}
            </button>
          </section>
          <section>
            <span className="bb-card-heading">Voice</span>
            <strong>{voiceClone.ready ? "Voice clone ready" : "Stock narrator voice"}</strong>
            <small>
              {voiceClone.ready
                ? "Your saved voice will narrate the message."
                : "We'll use a stock narrator. Set up a voice clone on Step 2 to make it yours."}
            </small>
          </section>
        </aside>
      </div>

      <div className="md-step-actions">
        <button className="bb-text-button" onClick={onBack}>
          ← Back
        </button>
        <span />
      </div>
    </section>
  );
}

function VoiceSetupCard({ onReady }: { onReady: (clone: VoiceCloneState) => void }) {
  const [sampleName, setSampleName] = useState("");
  const [sampleDataUrl, setSampleDataUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecorderSupported =
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = window.setInterval(
      () => setSeconds((current) => current + 1),
      1000
    );
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => () => stopVoiceStream(streamRef.current), []);

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      setError("Use one audio or video file for the voice sample.");
      return;
    }
    setSampleName(file.name);
    setSampleDataUrl(await fileToDataUrl(file));
    setConsent(false);
    setError("");
  }

  async function startRecording() {
    if (!isRecorderSupported) {
      setError("Microphone recording is not available in this browser.");
      return;
    }
    try {
      setError("");
      setSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecordingState("processing");
        const recordingType = recorder.mimeType || mimeType || "audio/webm";
        const recording = new Blob(chunksRef.current, { type: recordingType });
        stopVoiceStream(streamRef.current);
        streamRef.current = null;
        if (!recording.size) {
          setError("Recording was empty. Speak for at least 10 seconds.");
          setRecordingState("idle");
          return;
        }
        setSampleName(`recorded-voice.${extensionForMimeType(recordingType)}`);
        setSampleDataUrl(await fileToDataUrl(recording));
        setConsent(false);
        setRecordingState("idle");
      };
      recorder.start();
      setRecordingState("recording");
    } catch {
      setRecordingState("idle");
      stopVoiceStream(streamRef.current);
      streamRef.current = null;
      setError("Microphone access blocked. Allow it or upload a sample.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function save() {
    if (!sampleDataUrl) {
      setError("Record or upload a short voice sample first.");
      return;
    }
    if (!consent) {
      setError("Confirm this is your voice or that you have permission.");
      return;
    }
    setIsSaving(true);
    onReady(
      saveVoiceSetup({
        ready: true,
        voiceCloneName: sampleName || "Saved voice",
        voiceSampleName: sampleName || "recorded-voice.webm",
        voiceSampleDataUrl: sampleDataUrl,
        createdAt: Date.now()
      })
    );
    setIsSaving(false);
  }

  return (
    <section className="bb-voice-setup-card">
      <span className="bb-card-heading">First-time voice setup</span>
      <strong>Record your voice once.</strong>
      <small>
        Cloned and reused across every BirthdayBot and HolidayBot card you make.
      </small>
      <p>
        Try: &quot;Happy Mother&apos;s Day. I just wanted to send something that
        actually feels like a hug. Thank you for everything.&quot;
      </p>
      <div className="bb-voice-actions">
        {recordingState === "recording" ? (
          <button className="bb-sticker-button" onClick={stopRecording}>
            Stop recording {formatDuration(seconds)}
          </button>
        ) : (
          <button
            className="bb-outline-button"
            onClick={startRecording}
            disabled={recordingState === "processing"}
          >
            {sampleDataUrl ? "Record again" : "Record voice"}
          </button>
        )}
        <label className="bb-outline-button">
          Upload
          <input
            type="file"
            accept="audio/*,video/mp4,video/quicktime"
            onChange={onUpload}
          />
        </label>
      </div>
      {sampleName ? <small className="bb-selected-sample">Selected: {sampleName}</small> : null}
      <label className="bb-consent-row">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>I confirm this is my voice, or I have permission to clone and use it.</span>
      </label>
      {error ? <small className="bb-generation-error">{error}</small> : null}
      <button
        className="bb-sticker-button"
        onClick={save}
        disabled={isSaving || recordingState !== "idle"}
      >
        {isSaving ? "Saving…" : "Save voice clone"}
      </button>
    </section>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="bb-field">
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

function buildMothersDayDraftRequest(draft: Draft, voiceClone: VoiceCloneState): DraftRequest {
  return {
    mode: "simple",
    occasion: "mothers-day",
    birthdayName: draft.recipientName.trim(),
    prompt: draft.prompt.trim(),
    photoName: draft.photoName || `${draft.recipientName.trim() || "mothers-day"}.png`,
    photoDataUrl: draft.photoDataUrl,
    voiceSampleName: voiceClone.voiceSampleName,
    voiceSampleDataUrl: voiceClone.voiceSampleDataUrl,
    voiceConsent: Boolean(voiceClone.voiceSampleDataUrl),
    voiceCloneId: voiceClone.providerVoiceId,
    voiceCloneName: voiceClone.voiceCloneName,
    voiceMode: "narrate",
    advanced: defaultAdvancedSettings
  };
}

async function pollGenerationJob(
  initialJob: JobRecord,
  planRecord: PlanRecord,
  onJob: (job: JobRecord) => void
) {
  let latest = initialJob;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2200));
    const next = await studioApi.checkJob({ job: latest, plan: planRecord });
    latest = next;
    onJob(next);
    if (next.stage === "completed" || next.stage === "failed") return next;
  }
  throw new Error("Generation is still running. Check back in a moment.");
}

function readVoiceSetup(): VoiceCloneState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(voiceSetupStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoiceCloneState;
    return parsed.ready && parsed.voiceSampleDataUrl ? parsed : null;
  } catch {
    return null;
  }
}

function saveVoiceSetup(next: VoiceCloneState): VoiceCloneState {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(voiceSetupStorageKey, JSON.stringify(next));
  }
  return next;
}

function preferredRecordingMimeType() {
  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

function stopVoiceStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}
