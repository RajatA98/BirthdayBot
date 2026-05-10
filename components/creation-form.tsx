"use client";

import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
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
  birthdayName?: string;
  prompt?: string;
  voiceSample?: string;
  voiceConsent?: string;
};

type Phase = "draft" | "planning" | "review" | "generating" | "result";
type RecordingState = "idle" | "recording" | "processing";

const tones = [
  "Heartfelt",
  "Funny",
  "Short and sweet",
  "Sentimental",
  "Roast but loving"
] as const;

const sceneIdeas = [
  "Birthday party",
  "Birthday dinner",
  "Beach golden hour",
  "Road trip montage",
  "Rooftop city glow",
  "Dreamy surprise party"
] as const;

const motionLevels = ["Subtle", "Moderate", "Dramatic"] as const;
const aspectRatios = ["Portrait", "Square", "Landscape"] as const;

const voiceSampleScript =
  "Happy birthday. I wanted this to feel more personal than a regular message, because you deserve something with a little sparkle in it. I am grateful for your laugh, your heart, and the way you make ordinary moments feel worth remembering. I hope this next year brings good surprises, real peace, and more reasons to celebrate who you are.";

export function CreationForm({ api = studioApi }: { api?: StudioApi }) {
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [birthdayName, setBirthdayName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [voiceSampleName, setVoiceSampleName] = useState("");
  const [voiceSampleDataUrl, setVoiceSampleDataUrl] = useState("");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceSampleSource, setVoiceSampleSource] = useState<
    "" | "recorded" | "uploaded"
  >("");
  const [isRecorderSupported, setIsRecorderSupported] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [phase, setPhase] = useState<Phase>("draft");
  const [requestId, setRequestId] = useState("");
  const [plannedDraft, setPlannedDraft] = useState<DraftRequest | null>(null);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [caption, setCaption] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const [statusError, setStatusError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(
    defaultAdvancedSettings
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceFileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdvanced = mode === "advanced";

  useEffect(() => {
    setIsRecorderSupported(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );

    return () => {
      stopVoiceStream(voiceStreamRef.current);
    };
  }, []);

  useEffect(() => {
    if (recordingState !== "recording") {
      return;
    }

    const timer = setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [recordingState]);

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

  const summary = useMemo(() => {
    if (!prompt.trim()) {
      return "Describe the birthday moment you want and BirthdayBot will build the creative brief.";
    }

    return `BirthdayBot will shape a ${isAdvanced ? "guided" : "quick"} birthday concept around: "${prompt.trim()}".`;
  }, [isAdvanced, prompt]);

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

  async function onVoiceSampleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      setVoiceSampleName("");
      setVoiceSampleDataUrl("");
      setVoiceSampleSource("");
      setVoiceConsent(false);
      return;
    }

    if (
      !nextFile.type.startsWith("audio/") &&
      !nextFile.type.startsWith("video/")
    ) {
      setVoiceSampleName("");
      setVoiceSampleDataUrl("");
      setVoiceSampleSource("");
      setVoiceConsent(false);
      setErrors((current) => ({
        ...current,
        voiceSample: "Use one audio or video file for the voice sample."
      }));
      return;
    }

    setVoiceSampleName(nextFile.name);
    setVoiceSampleDataUrl(await fileToDataUrl(nextFile));
    setVoiceSampleSource("uploaded");
    setVoiceConsent(false);
    setRecordingError("");
    setErrors((current) => ({
      ...current,
      voiceSample: undefined,
      voiceConsent: undefined
    }));
  }

  async function startVoiceRecording() {
    if (!isRecorderSupported) {
      setRecordingError(
        "Voice recording is not available in this browser. Upload an audio file instead."
      );
      return;
    }

    setRecordingError("");
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordingError(
          "Recording stopped before a usable voice sample was saved."
        );
        setRecordingState("idle");
        stopVoiceStream(voiceStreamRef.current);
        voiceStreamRef.current = null;
      };

      recorder.onstop = async () => {
        setRecordingState("processing");
        const recordingType = recorder.mimeType || mimeType || "audio/webm";
        const recording = new Blob(voiceChunksRef.current, {
          type: recordingType
        });

        stopVoiceStream(voiceStreamRef.current);
        voiceStreamRef.current = null;

        if (!recording.size) {
          setRecordingError(
            "The recording was empty. Try again and speak for at least 15 seconds."
          );
          setRecordingState("idle");
          return;
        }

        try {
          setVoiceSampleName(
            `recorded-voice.${extensionForMimeType(recordingType)}`
          );
          setVoiceSampleDataUrl(await fileToDataUrl(recording));
          setVoiceSampleSource("recorded");
          setVoiceConsent(false);
          setErrors((current) => ({
            ...current,
            voiceSample: undefined,
            voiceConsent: undefined
          }));
        } catch {
          setRecordingError(
            "The recording could not be saved. Try uploading an audio file instead."
          );
        } finally {
          setRecordingState("idle");
        }
      };

      recorder.start();
      setRecordingState("recording");
    } catch {
      setRecordingState("idle");
      stopVoiceStream(voiceStreamRef.current);
      voiceStreamRef.current = null;
      setRecordingError(
        "Microphone access was blocked. Allow the microphone or upload an audio file."
      );
    }
  }

  function clearVoiceSample() {
    setVoiceSampleName("");
    setVoiceSampleDataUrl("");
    setVoiceSampleSource("");
    setVoiceConsent(false);
    setRecordingError("");
    setErrors((current) => ({
      ...current,
      voiceSample: undefined,
      voiceConsent: undefined
    }));
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === "recording") {
      setRecordingState("processing");
      recorder.stop();
    }
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!photoDataUrl) {
      nextErrors.photo = "Add one shared photo to continue.";
    }

    if (!birthdayName.trim()) {
      nextErrors.birthdayName = "Add their name for the birthday text.";
    }

    if (!prompt.trim()) {
      nextErrors.prompt = "Describe what the birthday video should feel like.";
    }

    if (voiceSampleDataUrl && !voiceConsent) {
      nextErrors.voiceConsent =
        "Confirm you have the rights to clone this voice before continuing.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildDraft(): DraftRequest {
    return {
      mode,
      birthdayName: birthdayName.trim(),
      prompt: prompt.trim(),
      photoName,
      photoDataUrl,
      voiceSampleName: voiceSampleName || undefined,
      voiceSampleDataUrl: voiceSampleDataUrl || undefined,
      voiceConsent: voiceSampleDataUrl ? voiceConsent : undefined,
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
      setPlannedDraft(draft);
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
    if (!requestId || !plannedDraft || !plan) {
      return;
    }

    setStatusError("");
    setIsStartingGeneration(true);
    try {
      const response = await api.startGeneration({
        requestId,
        draft: plannedDraft,
        plan,
        caption
      });
      setJob({
        jobId: response.jobId,
        requestId,
        stage: "queued",
        statusMessage: voiceSampleDataUrl
          ? "Queued and preparing the ElevenLabs voice narration."
          : "Queued and preparing the creative brief.",
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
        <PlanList label="Keep from photo" items={plan.keepFromPhoto} />
        <PlanCard label="Caption approach" value={plan.captionApproach} />

        <section className="summary-card">
          <p className="summary-label">On-video text</p>
          <p>{caption}</p>
        </section>

        {voiceSampleName ? (
          <section className="summary-card">
            <p className="summary-label">Narration voice</p>
            <p>
              ElevenLabs will clone {voiceSampleName} for the voice-over, then
              BirthdayBot will use the cloned voice to narrate the final
              birthday caption.
            </p>
          </section>
        ) : null}

        {statusError ? <p className="field-error">{statusError}</p> : null}

        <div className="action-row">
          <button
            className="primary-action"
            type="button"
            onClick={startGeneration}
            disabled={isStartingGeneration}
            aria-busy={isStartingGeneration}
          >
            {isStartingGeneration ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                Starting generation
              </>
            ) : (
              "Generate birthday video"
            )}
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
        <GenerationLoader stage={job.stage} />
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

        <ResultVideo
          caption={caption}
          videoUrl={job.videoUrl}
          voiceOverUrl={job.voiceOverUrl}
          birthdayName={plannedDraft?.birthdayName}
        />
        {job.voiceOverError ? (
          <p className="field-error">{job.voiceOverError}</p>
        ) : null}

        <div className="action-row">
          <a className="primary-action link-action" href={job.videoUrl} download>
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
        <span>Birthday name</span>
        <input
          aria-label="Birthday name"
          name="birthday-name"
          placeholder="Maya"
          value={birthdayName}
          onChange={(event) => {
            setBirthdayName(event.target.value);
            setErrors((current) => ({ ...current, birthdayName: undefined }));
          }}
          aria-invalid={Boolean(errors.birthdayName)}
          aria-describedby={errors.birthdayName ? "birthday-name-error" : undefined}
        />
      </label>
      {errors.birthdayName ? (
        <p className="field-error" id="birthday-name-error">
          {errors.birthdayName}
        </p>
      ) : null}

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

      <label className="upload-card" htmlFor="photo-upload">
        <span className="upload-title">Shared photo</span>
        <span className="upload-copy">
          One image with both people works best for the MVP.
        </span>
        <span className="upload-meta">
          {photoName ? `Selected: ${photoName}` : "Tap to choose a photo"}
        </span>
      </label>
      <input
        id="photo-upload"
        name="photo"
        type="file"
        accept="image/*"
        aria-label="Shared photo"
        onChange={onPhotoChange}
        aria-invalid={Boolean(errors.photo)}
        aria-describedby={errors.photo ? "photo-error" : undefined}
      />
      {errors.photo ? (
        <p className="field-error" id="photo-error">
          {errors.photo}
        </p>
      ) : null}

      <input
        ref={voiceFileInputRef}
        id="voice-sample-upload"
        name="voice-sample"
        type="file"
        accept="audio/*,video/mp4,video/quicktime"
        aria-label="Voice sample"
        onChange={onVoiceSampleChange}
        aria-invalid={Boolean(errors.voiceSample)}
        aria-describedby={errors.voiceSample ? "voice-sample-error" : undefined}
      />
      {errors.voiceSample ? (
        <p className="field-error" id="voice-sample-error">
          {errors.voiceSample}
        </p>
      ) : null}

      <section className="voice-recorder" aria-label="Voice input">
        <div className="voice-recorder-header">
          <div>
            <p className="summary-label">Voice input</p>
            <h2>Record the birthday voice-over sample.</h2>
          </div>
          <span
            className={
              recordingState === "recording"
                ? "recording-badge live"
                : "recording-badge"
            }
            aria-live="polite"
          >
            {recordingState === "recording"
              ? `Recording ${formatDuration(recordingSeconds)}`
              : voiceSampleName
                ? "Sample ready"
                : "Optional"}
          </span>
        </div>

        <div className="voice-script-card">
          <p className="summary-label">Read this aloud</p>
          <p className="voice-script">{voiceSampleScript}</p>
        </div>

        <div className="voice-recorder-actions">
          {recordingState === "recording" ? (
            <button
              className="primary-action"
              type="button"
              onClick={stopVoiceRecording}
            >
              Stop recording
            </button>
          ) : (
            <button
              className="ghost-action"
              type="button"
              onClick={startVoiceRecording}
              disabled={!isRecorderSupported || recordingState === "processing"}
            >
              {recordingState === "processing"
                ? "Saving voice sample"
                : voiceSampleName
                  ? "Record again"
                  : "Record voice sample"}
            </button>
          )}
          <button
            className="ghost-action"
            type="button"
            onClick={() => voiceFileInputRef.current?.click()}
          >
            Upload instead
          </button>
          <span className="upload-meta">
            {recordingState === "recording"
              ? "Speak naturally and leave a tiny pause between sentences."
              : "Aim for about 12-15 seconds in a quiet room."}
          </span>
        </div>

        <ul className="voice-tips" aria-label="Voice recording tips">
          <li>Hold the mic 6-10 inches away.</li>
          <li>Use your normal birthday-message energy.</li>
          <li>Skip background music or TV audio.</li>
        </ul>

        {voiceSampleDataUrl ? (
          <>
            <section className="voice-preview" aria-label="Selected voice sample">
              <div>
                <p className="summary-label">
                  {voiceSampleSource === "recorded" ? "Recorded sample" : "Uploaded sample"}
                </p>
                <p>{voiceSampleName}</p>
              </div>
              {voiceSampleDataUrl.startsWith("data:video/") ? (
                <video controls playsInline src={voiceSampleDataUrl} />
              ) : (
                <audio controls src={voiceSampleDataUrl} />
              )}
              <button className="ghost-action" type="button" onClick={clearVoiceSample}>
                Remove voice sample
              </button>
            </section>

            <label className="toggle-row voice-consent">
              <input
                type="checkbox"
                checked={voiceConsent}
                onChange={(event) => {
                  setVoiceConsent(event.target.checked);
                  setErrors((current) => ({
                    ...current,
                    voiceConsent: undefined
                  }));
                }}
                aria-invalid={Boolean(errors.voiceConsent)}
                aria-describedby={
                  errors.voiceConsent ? "voice-consent-error" : undefined
                }
              />
              <span>
                I confirm this is my voice, or I have permission to clone and
                use it for this birthday narration.
              </span>
            </label>
            {errors.voiceConsent ? (
              <p className="field-error" id="voice-consent-error">
                {errors.voiceConsent}
              </p>
            ) : null}
          </>
        ) : null}

        {!isRecorderSupported ? (
          <p className="subtle-note">
            Browser microphone recording is unavailable here, but uploading an
            audio or video file still works.
          </p>
        ) : null}
        {recordingError ? <p className="field-error">{recordingError}</p> : null}
      </section>

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
            options={["15 seconds", "10 seconds", "20 seconds"]}
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
            options={["Subtle", "Bold"]}
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

      <section className="summary-card" aria-live="polite">
        <p className="summary-label">Draft summary</p>
        <p>{summary}</p>
        {statusError ? <p className="field-error">{statusError}</p> : null}
      </section>

      <button className="primary-action" type="submit">
        Build my birthday brief
      </button>
    </form>
  );
}

function ResultVideo({
  caption,
  videoUrl,
  voiceOverUrl,
  birthdayName
}: {
  caption: string;
  videoUrl: string;
  voiceOverUrl?: string;
  birthdayName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function syncVoiceOver() {
    const video = videoRef.current;
    const audio = audioRef.current;

    if (!video || !audio) {
      return;
    }

    audio.currentTime = video.currentTime;
  }

  async function playVoiceOver() {
    const video = videoRef.current;
    const audio = audioRef.current;

    if (!video || !audio) {
      return;
    }

    audio.currentTime = video.currentTime;
    await audio.play().catch(() => undefined);
  }

  function pauseVoiceOver() {
    audioRef.current?.pause();
  }

  function endVoiceOver() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }

  return (
    <div className="result-video-frame">
      <video
        ref={videoRef}
        className="result-video"
        controls
        playsInline
        src={videoUrl}
        onEnded={endVoiceOver}
        onPause={pauseVoiceOver}
        onPlay={playVoiceOver}
        onSeeked={syncVoiceOver}
      />
      {voiceOverUrl ? (
        <audio ref={audioRef} preload="auto" src={voiceOverUrl} />
      ) : null}
      <div
        className="video-caption-overlay"
        aria-label={birthdayOverlayLine(birthdayName, caption)}
      >
        <span className="video-caption-title">
          {birthdayOverlayLine(birthdayName, caption)}
        </span>
      </div>
    </div>
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

function GenerationLoader({ stage }: { stage: JobRecord["stage"] }) {
  return (
    <div className="generation-loader" role="img" aria-label="Birthday video loading animation">
      <div className="loader-film" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="loader-orbit" aria-hidden="true">
        <span className="loader-spark one" />
        <span className="loader-spark two" />
        <span className="loader-spark three" />
      </div>
      <p>{stageHeading(stage)}</p>
    </div>
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

function birthdayOverlayLine(name: string | undefined, caption: string) {
  const resolvedName = name?.trim() || birthdayNameFromCaption(caption);

  return resolvedName ? `Happy Birthday ${resolvedName}` : "Happy Birthday";
}

function birthdayNameFromCaption(caption: string) {
  const match = caption.match(/^happy birthday(?:\s+to)?\s+([^.!?,]+)/i);
  return match?.[1]?.trim() || "";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

function preferredRecordingMimeType() {
  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  return "webm";
}

function stopVoiceStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
