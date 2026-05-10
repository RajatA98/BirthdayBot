"use client";

import React, {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useState
} from "react";

import { studioApi, StudioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import {
  AdvancedSettings,
  AgentPlan,
  DraftRequest,
  JobRecord
} from "@/lib/types";

type FormErrors = {
  photo?: string;
  prompt?: string;
};

type Phase = "draft" | "planning" | "review" | "generating" | "result";

const tones = [
  "Heartfelt",
  "Funny",
  "Short and sweet",
  "Sentimental",
  "Roast but loving"
] as const;

const sceneIdeas = [
  "Birthday dinner",
  "Beach golden hour",
  "Road trip montage",
  "Rooftop city glow",
  "Dreamy surprise party"
] as const;

const motionLevels = ["Subtle", "Moderate", "Dramatic"] as const;
const aspectRatios = ["Portrait", "Square", "Landscape"] as const;

export function CreationForm({ api = studioApi }: { api?: StudioApi }) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [prompt, setPrompt] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>("draft");
  const [requestId, setRequestId] = useState("");
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [caption, setCaption] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const [statusError, setStatusError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(
    defaultAdvancedSettings
  );

  const isAdvanced = mode === "advanced";

  useEffect(() => {
    if (phase !== "generating" || !job) {
      return;
    }

    const currentJobId = job.jobId;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const nextJob = await api.getJob(currentJobId);

        if (cancelled) {
          return;
        }

        setJob(nextJob);
        setCaption(nextJob.caption);

        if (nextJob.stage === "completed") {
          setPhase("result");
          return;
        }

        if (nextJob.stage === "failed") {
          setStatusError(nextJob.error || "Generation failed.");
          setPhase("review");
          return;
        }

        timer = setTimeout(poll, 700);
      } catch (error) {
        if (!cancelled) {
          setStatusError(
            error instanceof Error ? error.message : "Status check failed."
          );
          setPhase("review");
        }
      }
    }

    timer = setTimeout(poll, 700);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [api, job?.jobId, phase]);

  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      setPhotoName("");
      setPhotoDataUrl("");
      return;
    }

    setPhotoName(nextFile.name);
    setPhotoDataUrl(await fileToDataUrl(nextFile));
    setErrors((current) => ({ ...current, photo: undefined }));
  }

  async function applyPhotoFile(nextFile?: File) {
    if (!nextFile) {
      return;
    }

    setPhotoName(nextFile.name);
    setPhotoDataUrl(await fileToDataUrl(nextFile));
    setErrors((current) => ({ ...current, photo: undefined }));
  }

  async function onPhotoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingPhoto(false);
    await applyPhotoFile(event.dataTransfer.files?.[0]);
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!photoDataUrl) {
      nextErrors.photo = "Add one shared photo to continue.";
    }

    if (!prompt.trim()) {
      nextErrors.prompt = "Describe what the birthday video should feel like.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildDraft(): DraftRequest {
    return {
      mode,
      prompt: prompt.trim(),
      photoName,
      photoDataUrl,
      advanced
    };
  }

  async function requestPlan(nextDraft?: DraftRequest) {
    const draft = nextDraft ?? buildDraft();
    setStatusError("");
    setPhase("planning");

    try {
      const response = await api.createPlan(draft);
      setRequestId(response.requestId);
      setPlan(response.plan);
      setCaption(response.caption);
      setPhase("review");
    } catch (error) {
      setPhase("draft");
      setStatusError(
        error instanceof Error ? error.message : "Planning request failed."
      );
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    await requestPlan();
  }

  async function startGeneration() {
    if (!requestId) {
      return;
    }

    setStatusError("");
    setIsStartingGeneration(true);
    try {
      const response = await api.startGeneration(requestId);
      setJob({
        jobId: response.jobId,
        requestId,
        stage: "queued",
        statusMessage: "Queued and preparing the creative brief.",
        attempts: 1,
        caption,
        createdAt: Date.now()
      });
      setPhase("generating");
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Generation could not be started."
      );
    } finally {
      setIsStartingGeneration(false);
    }
  }

  async function surpriseAgain() {
    if (!validate()) {
      return;
    }

    const nextPrompt = `${prompt.trim()} Add one tasteful, cinematic surprise.`;
    setPrompt(nextPrompt);
    await requestPlan({
      ...buildDraft(),
      prompt: nextPrompt
    });
  }

  function adjustSettings() {
    setPhase("draft");
    setStatusError("");
  }

  function startFresh() {
    setMode("simple");
    setPrompt("");
    setPhotoName("");
    setPhotoDataUrl("");
    setErrors({});
    setPhase("draft");
    setRequestId("");
    setPlan(null);
    setCaption("");
    setJob(null);
    setStatusError("");
    setCopyStatus("");
    setIsStartingGeneration(false);
    setIsDraggingPhoto(false);
    setAdvanced(defaultAdvancedSettings);
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  if (phase === "planning") {
    return (
      <section className="status-panel" aria-live="polite">
        <p className="summary-label">Agent planning</p>
        <h2>Reading the photo and shaping the birthday concept.</h2>
        <p>
          BirthdayBot is analyzing the shared photo, preserving identity cues,
          and building a cinematic brief before generation starts.
        </p>
      </section>
    );
  }

  if (phase === "review" && plan) {
    return (
      <section className="review-stack">
        <section className="status-panel">
          <p className="summary-label">Agent plan</p>
          <h2>{plan.title}</h2>
          <p>{plan.concept}</p>
        </section>

        <PlanCard label="Vibe" value={plan.vibe} />
        <PlanCard label="Scene direction" value={plan.sceneDirection} />
        <PlanCard label="Motion direction" value={plan.motionDirection} />
        <PlanCard label="Generation strategy" value={plan.generationStrategy} />
        <PlanCard label="Subject count" value={String(plan.subjectCount)} />
        <PlanList label="Keep from photo" items={plan.keepFromPhoto} />
        <PlanList label="Identity anchors" items={plan.identityAnchors} />
        <PlanList label="Scene guardrails" items={plan.sceneGuardrails} />
        <PlanCard label="Caption approach" value={plan.captionApproach} />

        <section className="summary-card">
          <p className="summary-label">Birthday caption</p>
          <p>{caption}</p>
        </section>

        {statusError ? <p className="field-error">{statusError}</p> : null}

        <div className="action-row">
          <button className="primary-action" type="button" onClick={startGeneration}>
            Generate birthday video
          </button>
          <button className="ghost-action" type="button" onClick={adjustSettings}>
            Adjust prompt
          </button>
          <button className="ghost-action" type="button" onClick={surpriseAgain}>
            Surprise me again
          </button>
        </div>
      </section>
    );
  }

  if (phase === "generating" && job) {
    return (
      <section className="status-panel" aria-live="polite">
        <p className="summary-label">Generation in progress</p>
        <h2>{stageHeading(job.stage)}</h2>
        <p>{job.statusMessage}</p>
        {job.attempts > 1 ? (
          <p className="subtle-note">Automatic retry attempt {job.attempts} is in progress.</p>
        ) : null}
        <ProgressRail stage={job.stage} />
      </section>
    );
  }

  if (phase === "result" && job?.videoUrl) {
    return (
      <section className="review-stack">
        <section className="status-panel">
          <p className="summary-label">Birthday package ready</p>
          <h2>Your birthday video is ready to send.</h2>
          <p>
            Review the final video, copy the caption, or regenerate with a new
            vibe.
          </p>
        </section>

        <video className="result-video" controls playsInline src={job.videoUrl} />

        <section className="summary-card">
          <p className="summary-label">Birthday caption</p>
          <p>{caption}</p>
        </section>

        <div className="action-row">
          <a
            className="primary-action link-action"
            href={`/api/download/${job.jobId}`}
          >
            Download video
          </a>
          <button
            className="ghost-action"
            type="button"
            onClick={copyCaption}
          >
            {copyStatus === "copied"
              ? "Caption copied"
              : copyStatus === "failed"
                ? "Copy failed"
                : "Copy caption"}
          </button>
          <button className="ghost-action" type="button" onClick={surpriseAgain}>
            Regenerate
          </button>
          <button className="ghost-action" type="button" onClick={adjustSettings}>
            Adjust settings
          </button>
          <button className="ghost-action" type="button" onClick={startFresh}>
            Make a new video
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="creation-form" onSubmit={onSubmit} noValidate>
      <div className="mode-toggle" aria-label="Generation mode">
        <button
          type="button"
          className={mode === "simple" ? "mode-pill active" : "mode-pill"}
          onClick={() => setMode("simple")}
        >
          Simple
        </button>
        <button
          type="button"
          className={mode === "advanced" ? "mode-pill active" : "mode-pill"}
          onClick={() => setMode("advanced")}
        >
          Advanced
        </button>
      </div>

      <label className="field">
        <span>Prompt</span>
        <textarea
          aria-label="Prompt"
          name="prompt"
          rows={4}
          placeholder="Make it feel like a warm, cinematic rooftop birthday moment with soft motion and a little humor."
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setErrors((current) => ({ ...current, prompt: undefined }));
          }}
          aria-invalid={Boolean(errors.prompt)}
          aria-describedby={errors.prompt ? "prompt-error" : undefined}
        />
      </label>
      {errors.prompt ? (
        <p className="field-error" id="prompt-error">
          {errors.prompt}
        </p>
      ) : null}

      <label
        className={isDraggingPhoto ? "upload-card dragging" : "upload-card"}
        htmlFor="photo-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingPhoto(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDraggingPhoto(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setIsDraggingPhoto(false);
        }}
        onDrop={onPhotoDrop}
      >
        <span className="upload-title">Shared photo</span>
        {photoDataUrl ? (
          <>
            <img
              className="upload-preview"
              src={photoDataUrl}
              alt="Selected shared photo preview"
            />
            <span className="upload-copy upload-filename">{photoName}</span>
            <span className="upload-meta">
              Photo loaded. You can drop another file to replace it.
            </span>
          </>
        ) : (
          <>
            <span className="upload-icon" aria-hidden="true">
              ⤴
            </span>
            <span className="upload-copy strong">Drag and drop a photo here</span>
            <span className="upload-meta">or tap to browse from your device</span>
          </>
        )}
      </label>
      <input
        id="photo-upload"
        name="photo"
        type="file"
        accept="image/*"
        aria-label="Shared photo"
        onChange={async (event) => {
          await onPhotoChange(event);
          setIsDraggingPhoto(false);
        }}
        aria-invalid={Boolean(errors.photo)}
        aria-describedby={errors.photo ? "photo-error" : undefined}
      />
      {errors.photo ? (
        <p className="field-error" id="photo-error">
          {errors.photo}
        </p>
      ) : null}

      {isAdvanced ? (
        <section className="advanced-grid" aria-label="Advanced controls">
          <SelectField
            label="Tone"
            value={advanced.tone}
            options={tones}
            onChange={(value) => setAdvanced((current) => ({ ...current, tone: value }))}
          />
          <SelectField
            label="Scene idea"
            value={advanced.sceneIdea}
            options={sceneIdeas}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, sceneIdea: value }))
            }
          />
          <SelectField
            label="Video length"
            value={advanced.videoLength}
            options={["5 seconds", "10 seconds", "15 seconds"]}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, videoLength: value }))
            }
          />
          <SelectField
            label="Aspect ratio"
            value={advanced.aspectRatio}
            options={aspectRatios}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, aspectRatio: value }))
            }
          />
          <SelectField
            label="Caption style"
            value={advanced.captionStyle}
            options={["None", "Subtle", "Bold"]}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, captionStyle: value }))
            }
          />
          <SelectField
            label="Music vibe"
            value={advanced.musicVibe}
            options={["Uplifting", "Emotional", "Playful"]}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, musicVibe: value }))
            }
          />
          <SelectField
            label="Motion intensity"
            value={advanced.motionIntensity}
            options={motionLevels}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, motionIntensity: value }))
            }
          />
          <SelectField
            label="Agent goal mode"
            value={advanced.agentGoalMode}
            options={["Surprise me", "Stay close to prompt", "Polish and iterate"]}
            onChange={(value) =>
              setAdvanced((current) => ({ ...current, agentGoalMode: value }))
            }
          />
        </section>
      ) : null}

      {statusError ? <p className="field-error">{statusError}</p> : null}

      <button className="primary-action" type="submit">
        Build my birthday brief
      </button>
    </form>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        name={label.toLowerCase().replaceAll(" ", "-")}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlanCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="summary-card">
      <p className="summary-label">{label}</p>
      <p>{value}</p>
    </section>
  );
}

function PlanList({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="summary-card">
      <p className="summary-label">{label}</p>
      <ul className="bullet-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ProgressRail({ stage }: { stage: JobRecord["stage"] }) {
  const stages: Array<JobRecord["stage"]> = [
    "queued",
    "analyzing",
    "writing",
    "generating",
    "finalizing",
    "completed"
  ];
  const activeIndex = stages.indexOf(stage);

  return (
    <ol className="progress-rail">
      {stages.map((item, index) => (
        <li key={item} className={index <= activeIndex ? "done" : ""}>
          {stageHeading(item)}
        </li>
      ))}
    </ol>
  );
}

function stageHeading(stage: JobRecord["stage"]) {
  switch (stage) {
    case "queued":
      return "Queued for generation";
    case "analyzing":
      return "Analyzing photo";
    case "writing":
      return "Writing the creative brief";
    case "generating":
      return "Generating the video";
    case "retrying":
      return "Retrying with a refined plan";
    case "finalizing":
      return "Finalizing the output";
    case "completed":
      return "Generation complete";
    case "failed":
      return "Generation failed";
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}
