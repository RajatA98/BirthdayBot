"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { studioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { AgentPlan, DraftRequest, JobRecord, PlanRecord } from "@/lib/types";

type ColorName = "pink" | "yellow" | "lime" | "lavender" | "coral";
type FriendStatus = "idea" | "draft" | "scheduled" | "sent";
type View =
  | { name: "dashboard" }
  | { name: "wizard"; step: number; friend?: Friend }
  | { name: "detail"; id: number }
  | { name: "drafts" }
  | { name: "sent" }
  | { name: "calendar" }
  | { name: "settings" };

type Friend = {
  id: number;
  name: string;
  firstName: string;
  demoVideoUrl?: string;
  date: string;
  dateLong: string;
  daysUntil: number;
  age: number | "";
  relation: string;
  status: FriendStatus;
  photo: boolean;
  photoName?: string;
  photoDataUrl?: string;
  color: ColorName;
  message: string;
  style: "sing-along" | "lip-sync" | "serenade" | "";
  delivery: "text" | "email" | "link";
  email?: string;
  accents?: string[];
  accentsOther?: string;
  vibe?: string;
  vibeOther?: string;
  setting?: string;
  settingOther?: string;
  musicGenre?: string;
  musicGenreOther?: string;
  promptSuggestion?: string;
};

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

const friends: Friend[] = [
  {
    id: 1,
    name: "Cecilia",
    firstName: "Cecilia",
    demoVideoUrl: "/demo.mp4",
    date: "May 14",
    dateLong: "Thursday, May 14",
    daysUntil: 4,
    age: 31,
    relation: "Best friend",
    status: "scheduled",
    photo: true,
    color: "pink",
    message:
      "Happy birthday Cecilia. I hope this lands like a tiny party in your pocket and makes your day feel properly celebrated.",
    style: "sing-along",
    delivery: "text"
  },
  {
    id: 2,
    name: "Mom",
    firstName: "Mom",
    date: "May 22",
    dateLong: "Friday, May 22",
    daysUntil: 12,
    age: 64,
    relation: "Family",
    status: "scheduled",
    photo: true,
    color: "lavender",
    message:
      "Mom, happy birthday from your favorite middle child. Thank you for the snacks, the rides, the patience, the everything.",
    style: "lip-sync",
    delivery: "email"
  },
  {
    id: 3,
    name: "Dre Calloway",
    firstName: "Dre",
    date: "Jun 2",
    dateLong: "Tuesday, Jun 2",
    daysUntil: 23,
    age: 29,
    relation: "Friend",
    status: "draft",
    photo: true,
    color: "coral",
    message: "",
    style: "",
    delivery: "text"
  },
  {
    id: 4,
    name: "Auntie Cece",
    firstName: "Cece",
    date: "Jun 18",
    dateLong: "Thursday, Jun 18",
    daysUntil: 39,
    age: 58,
    relation: "Family",
    status: "scheduled",
    photo: true,
    color: "yellow",
    message:
      "Auntie Cece, the original party. Wishing you a year of front-row seats and all the dramatics you can handle.",
    style: "sing-along",
    delivery: "text"
  },
  {
    id: 5,
    name: "Jamie Park",
    firstName: "Jamie",
    date: "Jul 4",
    dateLong: "Saturday, Jul 4",
    daysUntil: 55,
    age: 34,
    relation: "Coworker",
    status: "idea",
    photo: false,
    color: "lime",
    message: "",
    style: "",
    delivery: "text"
  },
  {
    id: 6,
    name: "Theo",
    firstName: "Theo",
    date: "Jul 11",
    dateLong: "Saturday, Jul 11",
    daysUntil: 62,
    age: 6,
    relation: "Niece/Nephew",
    status: "scheduled",
    photo: true,
    color: "pink",
    message:
      "Theo!! Six years old. Auntie Sam loves you bigger than the moon and just-right like a perfect pancake.",
    style: "serenade",
    delivery: "email"
  }
];

const recentlySent = [
  { name: "Dad", date: "Apr 21", age: 67, color: "coral" as ColorName, reaction: "Loved it" },
  { name: "Rae Lin", date: "Mar 30", age: 30, color: "yellow" as ColorName, reaction: "Cried" },
  { name: "Ari", date: "Mar 12", age: 36, color: "lime" as ColorName, reaction: "Replayed 4x" }
];

const relations = ["Friend", "Best friend", "Family", "Partner", "Coworker", "Niece/Nephew", "Mentor"];
const colors: ColorName[] = ["pink", "yellow", "lime", "lavender", "coral"];
const styles = [
  { id: "sing-along", label: "Sing-along", icon: "mic", hint: "Birthday melody, your voice, photo claps along" },
  { id: "lip-sync", label: "Lip-sync", icon: "message", hint: "Photo speaks your note with subtle facial motion" },
  { id: "serenade", label: "Serenade", icon: "music", hint: "Soft instrumental under your spoken message" }
] as const;
const wizardSteps = [
  ["Who", "Name & date"],
  ["Photo", "Their face"],
  ["Prompt", "What you want"],
  ["Brief", "Edit the plan"],
  ["Preview", "Send it"]
];
const voiceSetupStorageKey = "birthdaybot:new-ui-voice-setup";

export default function Home() {
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [voiceClone, setVoiceClone] = useState<VoiceCloneState>({ ready: false });
  const counts = useMemo(
    () => ({
      scheduled: friends.filter((friend) => friend.status === "scheduled").length,
      draft: friends.filter((friend) => friend.status === "draft" || friend.status === "idea").length
    }),
    []
  );

  useEffect(() => {
    const savedVoiceSetup = readVoiceSetup();
    if (savedVoiceSetup?.ready) {
      setVoiceClone(savedVoiceSetup);
    }
  }, []);

  return (
    <main className="bb-app">
      <Sidebar view={view} setView={setView} counts={counts} voiceClone={voiceClone} />
      <section className="bb-stage">
        {view.name === "dashboard" ? <Dashboard setView={setView} /> : null}
        {view.name === "wizard" ? (
          <Wizard
            view={view}
            setView={setView}
            voiceClone={voiceClone}
            onVoiceCloneReady={setVoiceClone}
          />
        ) : null}
        {view.name === "detail" ? <DetailView id={view.id} setView={setView} /> : null}
        {view.name === "drafts" ? (
          <SimpleListView
            title="Drafts"
            eyebrow="Needs a little love"
            items={friends.filter((friend) => friend.status === "draft" || friend.status === "idea")}
            setView={setView}
          />
        ) : null}
        {view.name === "sent" ? <SentView /> : null}
        {view.name === "calendar" ? <CalendarView setView={setView} /> : null}
        {view.name === "settings" ? <SettingsView voiceClone={voiceClone} /> : null}
      </section>
    </main>
  );
}

function Sidebar({
  view,
  setView,
  counts,
  voiceClone
}: {
  view: View;
  setView: (view: View) => void;
  counts: { scheduled: number; draft: number };
  voiceClone: VoiceCloneState;
}) {
  return (
    <aside className="bb-sidebar">
      <button className="bb-brand bb-plain" onClick={() => setView({ name: "dashboard" })}>
        <span className="bb-brand-mark">b<span /></span>
        <span>
          <strong>birthday bot</strong>
          <small>NEVER FORGET A DAY *</small>
        </span>
      </button>

      <button
        className="bb-sticker-button"
        onClick={() => {
          clearWizardSnapshot();
          setView({ name: "wizard", step: 0, friend: blankFriend() });
        }}
      >
        <Icon name="plus" /> New birthday video
      </button>

      <nav className="bb-nav" aria-label="Birthday Bot">
        <NavButton active={view.name === "dashboard"} count={counts.scheduled} icon="list" label="Upcoming" onClick={() => setView({ name: "dashboard" })} />
        <NavButton active={view.name === "drafts"} count={counts.draft} icon="edit" label="Drafts" onClick={() => setView({ name: "drafts" })} />
        <NavButton active={view.name === "sent"} count={12} icon="send" label="Sent" onClick={() => setView({ name: "sent" })} />
        <NavButton active={view.name === "calendar"} icon="calendar" label="Calendar" onClick={() => setView({ name: "calendar" })} />
      </nav>

      <div className="bb-sidebar-bottom">
        <NavButton active={view.name === "settings"} icon="settings" label="Settings" onClick={() => setView({ name: "settings" })} />
        <div className="bb-you-card">
          <span className="bb-avatar">S</span>
          <span>
            <strong>Sam (you)</strong>
            <small><i className={voiceClone.ready ? "" : "needs-voice"} /> {voiceClone.ready ? "voice clone ready" : "voice setup needed"}</small>
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  active,
  count,
  icon,
  label,
  onClick
}: {
  active: boolean;
  count?: number;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`bb-nav-item ${active ? "is-active" : ""}`} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
      {count !== undefined ? <em>{count}</em> : null}
    </button>
  );
}

function Dashboard({ setView }: { setView: (view: View) => void }) {
  const hero = friends[0];
  const upcoming = friends.filter((friend) => friend.id !== hero.id && friend.daysUntil > 7);

  return (
    <div className="bb-scroll-view bb-dashboard">
      <Confetti density={34} />
      <div className="bb-dashboard-inner">
        <header className="bb-greeting">
          <strong>Hey Sam</strong>
          <span>6 birthdays in flight * 1 draft needs a message</span>
        </header>

        <HeroPreview
          friend={hero}
          onOpen={() => setView({ name: "detail", id: hero.id })}
          onEdit={() => {
            clearWizardSnapshot();
            setView({ name: "wizard", step: 2, friend: hero });
          }}
        />

        <section className="bb-section">
          <SectionHead label="Also this week" count={2} />
          <div className="bb-this-week-grid">
            <FeaturedCard friend={friends[1]} onClick={() => setView({ name: "detail", id: friends[1].id })} />
            <NudgeCard
              onClick={() => {
                clearWizardSnapshot();
                setView({ name: "wizard", step: 0, friend: blankFriend() });
              }}
            />
          </div>
        </section>

        <section className="bb-section">
          <SectionHead label="Coming up" count={upcoming.length} />
          <div className="bb-card-grid">
            {upcoming.map((friend) => (
              <BirthdayCard key={friend.id} friend={friend} onClick={() => setView({ name: "detail", id: friend.id })} />
            ))}
          </div>
        </section>

        <section className="bb-section">
          <SectionHead label="Recently sent" count={recentlySent.length} />
          <div className="bb-sent-row">
            {recentlySent.map((sent) => (
              <article className="bb-sent-mini" key={sent.name}>
                <Photo friend={{ ...blankFriend(), ...sent, id: sent.age, firstName: sent.name, dateLong: sent.date, daysUntil: 0, status: "sent", photo: true, message: "", style: "lip-sync", delivery: "text" }} size="small" />
                <span>
                  <strong>{sent.name}</strong>
                  <small>turned {sent.age} * {sent.date}</small>
                </span>
                <em>{sent.reaction}</em>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function HeroPreview({ friend, onOpen, onEdit }: { friend: Friend; onOpen: () => void; onEdit: () => void }) {
  return (
    <section className="bb-hero-preview">
      <button className="bb-hero-card-button bb-plain" onClick={onOpen}>
        <ConfettiBurst />
        <div className={`bb-postcard swatch-${friend.color} is-hero`}>
          {friend.demoVideoUrl ? (
            <video className="bb-demo-video" src={friend.demoVideoUrl} autoPlay muted loop playsInline />
          ) : (
            <Photo friend={friend} size="fill" />
          )}
          <div className="bb-postcard-shade" />
          <Stamp age={friend.age} />
          <PlayButton />
          <PostcardCaption friend={friend} />
        </div>
        <span className="bb-sticker-note note-days">in {friend.daysUntil} days!</span>
        <span className="bb-ready-note">READY TO SEND</span>
      </button>

      <div className="bb-hero-copy">
        <p className="bb-kicker"><i /> Up next * Sunday, May 10</p>
        <h1>
          Cecilia&apos;s about to get the <mark>cutest thing</mark> in her inbox.
        </h1>
        <p>
          Her postcard is sealed and queued for <strong>Thursday at 9 AM</strong>. Hit play to see exactly what
          she&apos;ll get, or sneak in one more inside joke.
        </p>
        <div className="bb-hero-actions">
          <button className="bb-sticker-button" onClick={onOpen}><Icon name="play" /> Play the postcard</button>
          <button className="bb-outline-button" onClick={onEdit}><Icon name="edit" /> Tweak the message</button>
        </div>
        <div className="bb-meta-strip">
          <Meta label="Demo" value="happy-birthday-cecilia" />
          <Meta label="Voice" value="0:23 * your voice" />
          <Meta label="Style" value={friend.style || "sing-along"} />
          <Meta label="Via" value={friend.delivery === "text" ? "sms" : friend.delivery} />
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ friend, onClick }: { friend: Friend; onClick: () => void }) {
  return (
    <button className="bb-featured-card bb-plain" onClick={onClick}>
      <span className="bb-feature-photo">
        <Photo friend={friend} size="feature" />
        <em><i /> {countdown(friend.daysUntil)}</em>
      </span>
      <span className="bb-feature-copy">
        <small>{friend.dateLong} * {friend.relation}</small>
        <strong>{friend.firstName} turns {friend.age}</strong>
        <span>&quot;{friend.message.slice(0, 112)}&quot;</span>
        <span className="bb-feature-foot"><StatusChip status={friend.status} /> delivers via {friend.delivery}</span>
      </span>
    </button>
  );
}

function BirthdayCard({ friend, onClick }: { friend: Friend; onClick: () => void }) {
  return (
    <button className="bb-birthday-card bb-plain" onClick={onClick}>
      <span className="bb-card-top">
        <Photo friend={friend} size="thumb" />
        <span>
          <strong>{friend.name}</strong>
          <small>turning {friend.age || "?"} * {friend.relation}</small>
        </span>
      </span>
      <span className="bb-card-mid">
        <span>
          <small>{countdown(friend.daysUntil)}</small>
          <strong>{friend.date}</strong>
        </span>
        <StatusChip status={friend.status} />
      </span>
      <span className="bb-ready-rail">
        <ReadyDot on={friend.photo} label="photo" />
        <ReadyDot on label="voice" />
        <ReadyDot on={Boolean(friend.message)} label="message" />
        <ReadyDot on={Boolean(friend.style)} label="style" />
        <em>via {friend.delivery === "text" ? "sms" : friend.delivery}</em>
      </span>
    </button>
  );
}

function NudgeCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="bb-nudge-card bb-plain" onClick={onClick}>
      <span><Icon name="plus" /></span>
      <strong>Add a birthday</strong>
      <small>Got someone we missed? Takes about 90 seconds.</small>
    </button>
  );
}

function Wizard({
  view,
  setView,
  voiceClone,
  onVoiceCloneReady
}: {
  view: Extract<View, { name: "wizard" }>;
  setView: (view: View) => void;
  voiceClone: VoiceCloneState;
  onVoiceCloneReady: (clone: VoiceCloneState) => void;
}) {
  const [draft, setDraft] = useState<Friend>(() => view.friend ?? blankFriend());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generation, setGeneration] = useState<GenerationState>({
    phase: "idle",
    message: "Ready to generate the final birthday video."
  });
  // Brief-stage state: the plan + caption the user is editing before
  // generation. Populated by /api/plan when entering Brief; flows into
  // /api/generate when the user clicks Generate.
  const [briefPlan, setBriefPlan] = useState<AgentPlan | null>(null);
  const [briefCaption, setBriefCaption] = useState("");
  const [briefRequestId, setBriefRequestId] = useState("");
  const [briefDraft, setBriefDraft] = useState<DraftRequest | null>(null);
  const [briefError, setBriefError] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const step = view.step;

  // sessionStorage hydration: when the user reloads mid-flow, pick the
  // wizard up where they left off. 2-hour TTL; stale snapshots are
  // dropped silently. Only runs once on mount.
  useEffect(() => {
    const snapshot = readWizardSnapshot();
    if (snapshot) {
      if (snapshot.draft) setDraft(snapshot.draft);
      if (snapshot.briefPlan) setBriefPlan(snapshot.briefPlan);
      if (snapshot.briefCaption) setBriefCaption(snapshot.briefCaption);
      if (snapshot.briefRequestId) setBriefRequestId(snapshot.briefRequestId);
      if (snapshot.briefDraft) setBriefDraft(snapshot.briefDraft);
      if (snapshot.generation) setGeneration(snapshot.generation);
    }
    setHydrated(true);
  }, []);

  // Persist on every meaningful change. SessionStorage quota errors are
  // swallowed silently — live in-memory flow keeps working.
  useEffect(() => {
    if (!hydrated) return;
    writeWizardSnapshot({
      draft,
      briefPlan,
      briefCaption,
      briefRequestId,
      briefDraft,
      generation
    });
  }, [hydrated, draft, briefPlan, briefCaption, briefRequestId, briefDraft, generation]);

  useEffect(() => {
    if (!generating) {
      return;
    }

    // Cosmetic progress bar only — caps at 92% and waits for the real
    // job to finish before allowing 100%. The actual generating flag
    // is flipped off in handleJob's terminal branch (or in the catch).
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(92, current + 5));
    }, 280);

    return () => window.clearInterval(timer);
  }, [generating]);

  function update(patch: Partial<Friend>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.name !== undefined) {
        next.firstName = firstName(patch.name);
      }
      return next;
    });
  }

  function go(nextStep: number) {
    setView({ name: "wizard", step: nextStep, friend: draft });
  }

  async function loadBrief() {
    if (!draft.photoDataUrl) {
      setBriefError("Upload a photo on the previous step first.");
      return;
    }
    if (!draft.message?.trim()) {
      setBriefError("Add a quick prompt on the previous step first.");
      return;
    }

    setBriefLoading(true);
    setBriefError("");
    try {
      const safePhoto = await ensureSafePhotoDataUrl(draft.photoDataUrl);
      if (safePhoto !== draft.photoDataUrl) {
        update({ photoDataUrl: safePhoto });
      }
      const safeDraft = { ...draft, photoDataUrl: safePhoto };
      const requestDraft = buildSimpleDraftRequest(safeDraft, voiceClone);
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
      setProgress(0);
      setGenerating(true);
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

      const generationJob = await studioApi.startGeneration({
        ...planRecord,
        cachedProviderVoiceId: voiceClone.providerVoiceId
      });

      setGeneration({
        phase: "generating",
        message: "Starting video generation.",
        requestId: planRecord.requestId,
        plan: briefPlan,
        caption: briefCaption
      });

      const handleJob = (job: JobRecord) => {
        if (job.providerVoiceId) {
          onVoiceCloneReady(
            saveVoiceSetup({ ...voiceClone, providerVoiceId: job.providerVoiceId })
          );
        }

        const isTerminal = job.stage === "completed" || job.stage === "failed";

        setGeneration({
          phase: job.stage === "completed" ? "completed" : job.stage === "failed" ? "failed" : "generating",
          message: job.statusMessage,
          requestId: planRecord.requestId,
          plan: briefPlan,
          caption: job.caption || briefCaption,
          job,
          videoUrl: job.videoUrl,
          voiceOverUrl: job.voiceOverUrl,
          error: job.error || job.voiceOverError
        });

        if (isTerminal) {
          setProgress(100);
          setGenerating(false);
        }
      };

      handleJob(generationJob);

      if (generationJob.stage !== "completed" && generationJob.stage !== "failed") {
        await pollGenerationJob(generationJob, planRecord, handleJob);
      }
    } catch (error) {
      setGenerating(false);
      setGeneration({
        phase: "failed",
        message: "Video generation could not be started.",
        error: error instanceof Error ? error.message : "Unknown generation error."
      });
    }
  }

  return (
    <div className="bb-wizard">
      <header className="bb-wizard-topbar">
        <button className="bb-text-button" onClick={() => setView({ name: "dashboard" })}><Icon name="arrowLeft" /> Back to dashboard</button>
        <span>autosaved * 3s ago</span>
        <button className="bb-outline-button" onClick={() => setView({ name: "dashboard" })}>Save & exit</button>
        <button className="bb-icon-button" onClick={() => setView({ name: "dashboard" })} aria-label="Close"><Icon name="x" /></button>
      </header>

      <Stepper step={step} onStep={go} />

      <div className="bb-wizard-body">
        {step === 0 ? <StepWho draft={draft} update={update} /> : null}
        {step === 1 ? <StepPhoto draft={draft} update={update} /> : null}
        {step === 2 ? (
          <StepPrompt
            draft={draft}
            update={update}
            voiceClone={voiceClone}
            onVoiceCloneReady={onVoiceCloneReady}
          />
        ) : null}
        {step === 3 ? (
          <StepBrief
            plan={briefPlan}
            caption={briefCaption}
            loading={briefLoading}
            error={briefError}
            onPlanChange={setBriefPlan}
            onCaptionChange={setBriefCaption}
            onLoad={loadBrief}
          />
        ) : null}
        {step === 4 ? (
          <StepPreview
            draft={draft}
            update={update}
            voiceClone={voiceClone}
            onVoiceCloneReady={onVoiceCloneReady}
            generation={generation}
            generating={generating}
            progress={progress}
            start={() => { setProgress(0); setGenerating(true); }}
            generateVideo={generateVideo}
          />
        ) : null}
      </div>

      <footer className="bb-wizard-footer">
        <button className="bb-text-button" onClick={() => (step > 0 ? go(step - 1) : setView({ name: "dashboard" }))}>
          <Icon name="arrowLeft" /> {step > 0 ? "Back" : "Cancel"}
        </button>
        <span>step {step + 1} of 5</span>
        {step < 4 ? (
          <button
            className="bb-sticker-button"
            onClick={() => {
              const next = step + 1;
              if (next === 3 && !briefPlan && !briefLoading) {
                void loadBrief();
              }
              go(next);
            }}
            disabled={
              (step === 1 && !draft.photoDataUrl) ||
              (step === 2 && !draft.message?.trim()) ||
              (step === 3 && (!briefPlan || briefLoading))
            }
          >
            {step === 2 ? "Build the brief" : "Next"} <Icon name="arrowRight" />
          </button>
        ) : (
          <button className="bb-sticker-button" onClick={() => setView({ name: "dashboard" })}>
            <Icon name="check" /> Schedule for {draft.date || "birthday"}
          </button>
        )}
      </footer>
    </div>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <div className="bb-stepper">
      {wizardSteps.map(([label, hint], index) => (
        <button
          key={label}
          className={index < step ? "is-done" : index === step ? "is-active" : ""}
          disabled={index > step}
          onClick={() => onStep(index)}
        >
          <span>{index < step ? <Icon name="check" /> : index + 1}</span>
          <strong>{label}</strong>
          <small>{hint}</small>
        </button>
      ))}
    </div>
  );
}

function StepWho({ draft, update }: { draft: Friend; update: (patch: Partial<Friend>) => void }) {
  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 1 * Who's the lucky one"
        title={<>Tell me who we&apos;re <mark className="lime">celebrating</mark>.</>}
        sub="The basics so I know when to send it and how to address them."
      />
      <div className="bb-field-grid">
        <Field label="Their name">
          <input value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="e.g. Maya Reyes" />
        </Field>
        <Field label="Birthday">
          <input value={draft.date} onChange={(event) => update({ date: event.target.value, dateLong: event.target.value })} placeholder="May 14" />
        </Field>
        <Field label="Turning" hint="optional">
          <input value={draft.age} onChange={(event) => update({ age: event.target.value ? Number(event.target.value) : "" })} placeholder="31" />
        </Field>
        <Field label="How do you know them?">
          <select value={draft.relation} onChange={(event) => update({ relation: event.target.value })}>
            {relations.map((relation) => <option key={relation}>{relation}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Card color" hint="dashboard swatch">
        <div className="bb-color-picker">
          {colors.map((color) => (
            <button key={color} className={`swatch-${color} ${draft.color === color ? "is-active" : ""}`} onClick={() => update({ color })} aria-label={color}>
              {draft.color === color ? <Icon name="check" /> : null}
            </button>
          ))}
        </div>
      </Field>
      <div className="bb-tip-card">
        <Icon name="sparkle" />
        <span><strong>Tip:</strong> if they&apos;re family, we&apos;ll add this to your shared Family calendar so siblings can chip in too.</span>
      </div>
    </section>
  );
}

function StepPhoto({ draft, update }: { draft: Friend; update: (patch: Partial<Friend>) => void }) {
  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToCompressedDataUrl(file);
    update({
      photo: true,
      photoName: file.name,
      photoDataUrl: dataUrl,
      promptSuggestion: undefined
    });
  }

  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 2 * The face of the day"
        title={<>Drop a <mark className="coral">photo</mark> we can animate.</>}
        sub="Front-facing works best. We'll lip-sync your cloned voice to it on the day."
      />
      <div className="bb-photo-layout">
        <label className={`bb-dropzone ${draft.photo ? "has-photo" : ""}`}>
          <input type="file" accept="image/*" onChange={onPhotoChange} />
          {draft.photo ? (
            <>
              <Photo friend={draft} size="photo" />
              <span className="bb-file-pill"><i /> {draft.photoName || "maya-grad-2024.jpg"}</span>
              <strong>Replace</strong>
            </>
          ) : (
            <span className="bb-drop-empty">
              <Icon name="upload" />
              <strong>Drop a photo here</strong>
              <small>or click to choose * jpg, png, heic up to 20MB</small>
            </span>
          )}
        </label>
        <aside className="bb-tips-list">
          <strong>What works best</strong>
          {[
            ["Face fills 60% of the frame", true],
            ["Even lighting, no harsh shadows", true],
            ["One person, looking near-camera", true],
            ["Sunglasses or hats covering eyes", false]
          ].map(([tip, ok]) => (
            <span key={String(tip)} className={ok ? "ok" : "bad"}><i>{ok ? <Icon name="check" /> : <Icon name="x" />}</i>{tip}</span>
          ))}
          <p>We make it move just enough to feel alive: eyes blink, mouth follows your voice.</p>
        </aside>
      </div>
    </section>
  );
}

const accentChips = [
  "Cake & candles",
  "Balloons",
  "Fireworks",
  "Confetti & sparklers"
];
const vibeChips = [
  "Warm & heartfelt",
  "Hype & energetic",
  "Thankful & sentimental",
  "Playful & funny"
];
const settingChips = [
  "Rooftop golden hour",
  "Beach sunset",
  "Cozy indoor",
  "Festive outdoor"
];
const musicChips = [
  "Pop",
  "Hip-hop",
  "R&B",
  "Rock",
  "Country",
  "Indie",
  "Acoustic"
];

function StepPrompt({
  draft,
  update,
  voiceClone,
  onVoiceCloneReady
}: {
  draft: Friend;
  update: (patch: Partial<Friend>) => void;
  voiceClone: VoiceCloneState;
  onVoiceCloneReady: (clone: VoiceCloneState) => void;
}) {
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  async function loadSuggestion() {
    if (!draft.photoDataUrl) {
      setSuggestError("Upload a photo on the previous step first.");
      return;
    }
    setSuggestLoading(true);
    setSuggestError("");
    try {
      const safePhoto = await ensureSafePhotoDataUrl(draft.photoDataUrl);
      if (safePhoto !== draft.photoDataUrl) {
        update({ photoDataUrl: safePhoto });
      }
      const result = await studioApi.suggestPrompt({
        photoDataUrl: safePhoto,
        photoName: draft.photoName,
        birthdayName: draft.firstName || draft.name
      });
      update({ promptSuggestion: result.suggestion });
    } catch (error) {
      setSuggestError(
        error instanceof Error
          ? error.message
          : "Couldn't draft a suggestion."
      );
    } finally {
      setSuggestLoading(false);
    }
  }

  function toggleAccent(label: string) {
    const current = draft.accents ?? [];
    const next = current.includes(label)
      ? current.filter((entry) => entry !== label)
      : [...current, label];
    update({ accents: next });
  }

  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 3 * What you want"
        title={<>Tell us what kind of <mark className="pink">birthday video</mark> to make.</>}
        sub="Say it the way you'd describe it to a friend. We'll turn this into a director's brief on the next step — and you can edit anything you don't love."
      />
      <Field
        label="Prompt"
        hint={`${(draft.message || "").length} / 500`}
      >
        <textarea
          value={draft.message}
          maxLength={500}
          rows={6}
          onChange={(event) => update({ message: event.target.value })}
          placeholder="Make it feel like a warm cinematic rooftop birthday at golden hour, with the two of us laughing about that time we missed the last train home."
        />
      </Field>
      <div className="bb-suggest-row">
        <button
          className="bb-outline-button"
          onClick={loadSuggestion}
          disabled={suggestLoading || !draft.photoDataUrl}
        >
          <Icon name="sparkle" />
          {suggestLoading ? "Drafting..." : "Suggest from your photo"}
        </button>
        {draft.promptSuggestion ? (
          <div className="bb-suggest-pill">
            <span>{draft.promptSuggestion}</span>
            <button
              className="bb-text-button"
              onClick={() => update({ message: draft.promptSuggestion })}
            >
              Use this
            </button>
          </div>
        ) : null}
        {suggestError ? <p className="bb-field-error">{suggestError}</p> : null}
      </div>
      <ChipRow
        label="Accents"
        hint="Stack as many as you like."
        chips={accentChips}
        selected={draft.accents ?? []}
        otherValue={draft.accentsOther || ""}
        onToggle={toggleAccent}
        onOtherChange={(value) => update({ accentsOther: value })}
        multi
      />
      <ChipRow
        label="Vibe"
        hint="Pick the emotional tone."
        chips={vibeChips}
        selected={draft.vibe ? [draft.vibe] : []}
        otherValue={draft.vibeOther || ""}
        onToggle={(label) =>
          update({ vibe: draft.vibe === label ? "" : label })
        }
        onOtherChange={(value) => update({ vibeOther: value })}
      />
      <ChipRow
        label="Setting"
        hint="Optional — anchors the location."
        chips={settingChips}
        selected={draft.setting ? [draft.setting] : []}
        otherValue={draft.settingOther || ""}
        onToggle={(label) =>
          update({ setting: draft.setting === label ? "" : label })
        }
        onOtherChange={(value) => update({ settingOther: value })}
      />
      <ChipRow
        label="Music"
        hint="Optional — colors the soundtrack vibe."
        chips={musicChips}
        selected={draft.musicGenre ? [draft.musicGenre] : []}
        otherValue={draft.musicGenreOther || ""}
        onToggle={(label) =>
          update({ musicGenre: draft.musicGenre === label ? "" : label })
        }
        onOtherChange={(value) => update({ musicGenreOther: value })}
      />
      <div className="bb-voice-block">
        {voiceClone.ready ? (
          <section className="bb-voice-ready-card">
            <span className="bb-card-heading">Account voice</span>
            <strong>Voice clone ready</strong>
            <small>
              {voiceClone.voiceCloneName || "Saved voice"} will be reused
              for every birthday video — pulled from your saved setup so
              you don't have to redo it.
            </small>
            <button
              className="bb-outline-button"
              onClick={() => onVoiceCloneReady({ ready: false })}
            >
              <Icon name="mic" /> Re-record voice
            </button>
          </section>
        ) : (
          <VoiceSetupCard onReady={onVoiceCloneReady} />
        )}
      </div>
    </section>
  );
}

function ChipRow({
  label,
  hint,
  chips,
  selected,
  otherValue,
  onToggle,
  onOtherChange,
  multi = false
}: {
  label: string;
  hint?: string;
  chips: string[];
  selected: string[];
  otherValue: string;
  onToggle: (label: string) => void;
  onOtherChange: (value: string) => void;
  multi?: boolean;
}) {
  const [otherOpen, setOtherOpen] = useState(Boolean(otherValue));
  return (
    <div className="bb-chip-row">
      <header>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </header>
      <div className="bb-chip-list">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`bb-chip ${selected.includes(chip) ? "is-selected" : ""}`}
            onClick={() => onToggle(chip)}
          >
            {chip}
          </button>
        ))}
        <button
          type="button"
          className={`bb-chip ${otherOpen || otherValue ? "is-selected" : ""}`}
          onClick={() => {
            if (otherOpen && otherValue) {
              onOtherChange("");
            }
            setOtherOpen((open) => !open);
          }}
          aria-pressed={otherOpen}
        >
          Other…
        </button>
      </div>
      {otherOpen ? (
        <input
          type="text"
          className="bb-chip-other"
          maxLength={80}
          placeholder={
            multi
              ? `Add your own ${label.toLowerCase()} — comma-separate for many.`
              : `Describe your own ${label.toLowerCase()}.`
          }
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}

function StepBrief({
  plan,
  caption,
  loading,
  error,
  onPlanChange,
  onCaptionChange,
  onLoad
}: {
  plan: AgentPlan | null;
  caption: string;
  loading: boolean;
  error: string;
  onPlanChange: (plan: AgentPlan) => void;
  onCaptionChange: (caption: string) => void;
  onLoad: () => void;
}) {
  useEffect(() => {
    if (!plan && !loading && !error) {
      onLoad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <section className="bb-step-panel">
        <Heading
          kicker="Step 4 * Director's brief"
          title={<>Building the <mark className="yellow">brief</mark>...</>}
          sub="Hang on a few seconds while we draft a plan you can edit."
        />
        <div className="bb-brief-loading">
          <Icon name="sparkle" /> Drafting the brief from your prompt...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bb-step-panel">
        <Heading
          kicker="Step 4 * Director's brief"
          title={<>Couldn't <mark className="pink">build</mark> the brief.</>}
          sub={error}
        />
        <button className="bb-sticker-button" onClick={onLoad}>
          Try again
        </button>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="bb-step-panel">
        <Heading
          kicker="Step 4 * Director's brief"
          title={<>Almost <mark className="yellow">there</mark>.</>}
          sub="Click below and we'll draft a brief from your prompt — then you can edit any part of it before we render."
        />
        <button className="bb-sticker-button" onClick={onLoad}>
          Build the brief
        </button>
      </section>
    );
  }

  function field<K extends keyof AgentPlan>(key: K, value: AgentPlan[K]) {
    onPlanChange({ ...plan!, [key]: value });
  }

  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 4 * Director's brief"
        title={<>Edit the <mark className="yellow">brief</mark> if you want.</>}
        sub="Everything below is editable. Tweak the message, adjust the vibe, sharpen the scene direction — then move to Generate."
      />
      <div className="bb-brief-grid">
        <Field label="Title">
          <input
            value={plan.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </Field>
        <Field label="Concept">
          <textarea
            value={plan.concept}
            rows={2}
            onChange={(e) => field("concept", e.target.value)}
          />
        </Field>
        <Field label="Birthday message" hint={`${caption.length} chars`}>
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
        <Field label="Surprise factor">
          <textarea
            value={plan.surpriseFactor}
            rows={2}
            onChange={(e) => field("surpriseFactor", e.target.value)}
          />
        </Field>
        <Field label="Keep from photo" hint="One cue per line">
          <textarea
            value={plan.keepFromPhoto.join("\n")}
            rows={Math.max(2, plan.keepFromPhoto.length)}
            onChange={(e) =>
              field(
                "keepFromPhoto",
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              )
            }
          />
        </Field>
      </div>
      <p className="bb-brief-locked">
        Identity guardrails (subjectCount, identity anchors, scene
        guardrails) are read-only — they're what stops the model from
        swapping out the people in the video.
      </p>
    </section>
  );
}

function StepPreview({
  draft,
  update,
  voiceClone,
  onVoiceCloneReady,
  generation,
  generating,
  progress,
  start,
  generateVideo
}: {
  draft: Friend;
  update: (patch: Partial<Friend>) => void;
  voiceClone: VoiceCloneState;
  onVoiceCloneReady: (clone: VoiceCloneState) => void;
  generation: GenerationState;
  generating: boolean;
  progress: number;
  start: () => void;
  generateVideo: () => void;
}) {
  const stage = progress < 35 ? "analyzing photo" : progress < 65 ? "mapping voice" : progress < 92 ? "rendering" : "almost done";
  const isGenerating = generation.phase === "planning" || generation.phase === "generating";

  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 4 * Final look"
        title={generating ? <>Stitching together <mark className="yellow">{draft.firstName || "their"}</mark>&apos;s video...</> : <>Looks <mark className="lime">great.</mark> Wanna send it?</>}
        sub={generating ? "Photo + voice + message + style are coming together." : "It'll go out on the morning of their birthday. You can edit any time before."}
      />
      <div className="bb-preview-layout">
        <div className={`bb-postcard swatch-${draft.color} is-preview`}>
          {generation.videoUrl ? (
            <GeneratedVideo
              videoUrl={generation.videoUrl}
              voiceOverUrl={generation.voiceOverUrl}
            />
          ) : (
            <Photo friend={{ ...draft, photo: true }} size="fill" />
          )}
          {!generation.videoUrl ? <div className="bb-postcard-shade" /> : null}
          {!generating && !isGenerating && !generation.videoUrl ? <PlayButton /> : null}
          {(generating || isGenerating) && !generation.videoUrl ? (
            <div className="bb-rendering">
              <span />
              <strong>{isGenerating ? generation.message : stage}</strong>
              <i><b style={{ width: `${progress}%` }} /></i>
            </div>
          ) : null}
          {!generation.videoUrl ? <PostcardCaption friend={draft} /> : null}
        </div>
        <aside className="bb-preview-side">
          <section className={voiceClone.ready ? "bb-voice-ready-card" : "bb-voice-ready-card is-stock"}>
            <span className="bb-card-heading">Voice</span>
            <strong>{voiceClone.ready ? "Voice clone ready" : "Stock narrator voice"}</strong>
            <small>
              {voiceClone.ready
                ? `${voiceClone.voiceCloneName || "Saved voice"} will narrate this video — pulled from your saved setup.`
                : "We'll use a stock narrator. Set up a voice clone on the Prompt step to make it yours."}
            </small>
          </section>
          <section>
            <span className="bb-card-heading">Sends on <StatusChip status="scheduled" /></span>
            <strong>{draft.dateLong || draft.date || "Pick a date"}</strong>
            <small>at 9:00 AM in their timezone</small>
            <div className="bb-segmented">
              {[
                ["text", "Text"],
                ["email", "Email"],
                ["link", "Link"]
              ].map(([id, label]) => (
                <button key={id} className={draft.delivery === id ? "is-active" : ""} onClick={() => update({ delivery: id as Friend["delivery"] })}>{label}</button>
              ))}
            </div>
          </section>
          <section>
            <span className="bb-card-heading">Recipe</span>
            <Recipe label="Photo" value={draft.photoName || "maya-grad-2024.jpg"} ok={draft.photo} />
            <Recipe
              label="Voice"
              value={voiceClone.ready ? "your cloned voice * saved" : "stock narrator (no setup)"}
              ok={true}
            />
            <Recipe label="Prompt" value={draft.message || "Needs prompt"} ok={Boolean(draft.message)} />
          </section>
          <section className={`bb-generation-card is-${generation.phase}`}>
            <span className="bb-card-heading">Video output</span>
            <strong>{generation.phase === "completed" ? "Video ready" : generation.phase === "failed" ? "Needs attention" : "Generate video"}</strong>
            <small>{generation.error || generation.message}</small>
            <button
              className="bb-sticker-button"
              onClick={generateVideo}
              disabled={isGenerating}
            >
              <Icon name="play" /> {isGenerating ? "Generating..." : generation.videoUrl ? "Generate again" : "Generate birthday video"}
            </button>
          </section>
          {draft.delivery === "email" ? (
            <EmailSendCard
              draft={draft}
              update={update}
              videoUrl={generation.videoUrl}
              caption={generation.caption}
            />
          ) : null}
          <button className="bb-outline-button" onClick={start}><Icon name="sparkle" /> Regenerate preview</button>
        </aside>
      </div>
    </section>
  );
}

function GeneratedVideo({
  videoUrl,
  voiceOverUrl
}: {
  videoUrl: string;
  voiceOverUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    function onPlay() {
      audio!.currentTime = video!.currentTime;
      audio!.play().catch(() => {});
    }
    function onPause() {
      audio!.pause();
    }
    function onSeek() {
      audio!.currentTime = video!.currentTime;
    }
    function onRateChange() {
      audio!.playbackRate = video!.playbackRate;
    }

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("ratechange", onRateChange);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("ratechange", onRateChange);
    };
  }, [videoUrl, voiceOverUrl]);

  return (
    <>
      <video
        ref={videoRef}
        className="bb-generated-video"
        controls
        playsInline
        src={videoUrl}
      />
      {voiceOverUrl ? (
        <audio ref={audioRef} src={voiceOverUrl} preload="auto" />
      ) : null}
    </>
  );
}

function EmailSendCard({
  draft,
  update,
  videoUrl,
  caption
}: {
  draft: Friend;
  update: (patch: Partial<Friend>) => void;
  videoUrl?: string;
  caption?: string;
}) {
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState("");
  const [error, setError] = useState("");

  async function sendEmail() {
    setError("");
    setSentId("");
    if (!videoUrl) {
      setError("Generate the birthday video before sending.");
      return;
    }
    if (!draft.email?.trim()) {
      setError("Enter a recipient email above.");
      return;
    }
    setSending(true);
    try {
      const result = await studioApi.sendEmail({
        to: draft.email.trim(),
        birthdayName: draft.firstName || draft.name || "your friend",
        message: draft.message || "Happy birthday!",
        caption,
        videoUrl
      });
      setSentId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="bb-email-card">
      <span className="bb-card-heading">Email it</span>
      <strong>Send to inbox</strong>
      <small>
        We&apos;ll deliver the muxed video as an inline player plus a
        watch-link fallback. Powered by Resend.
      </small>
      <input
        type="email"
        placeholder="recipient@example.com"
        value={draft.email || ""}
        onChange={(event) => update({ email: event.target.value })}
        autoComplete="email"
      />
      {error ? <p className="bb-field-error">{error}</p> : null}
      {sentId ? (
        <p className="bb-email-sent">Sent — provider id {sentId}.</p>
      ) : null}
      <button
        className={`bb-sticker-button ${sending ? "is-sending" : ""}`}
        onClick={sendEmail}
        disabled={sending || !videoUrl}
      >
        <Icon name="check" /> {sending ? "Sending..." : "Send birthday email"}
      </button>
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
    if (recordingState !== "recording") {
      return;
    }

    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);

    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    return () => stopVoiceStream(streamRef.current);
  }, []);

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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
      setError("Microphone recording is not available in this browser. Upload an audio file instead.");
      return;
    }

    try {
      setError("");
      setSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setRecordingState("processing");
        const recordingType = recorder.mimeType || mimeType || "audio/webm";
        const recording = new Blob(chunksRef.current, { type: recordingType });

        stopVoiceStream(streamRef.current);
        streamRef.current = null;

        if (!recording.size) {
          setError("The recording was empty. Try again and speak for at least 10 seconds.");
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
      setError("Microphone access was blocked. Allow the microphone or upload an audio file.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function saveVoiceClone() {
    if (!sampleDataUrl) {
      setError("Record or upload a short voice sample first.");
      return;
    }

    if (!consent) {
      setError("Confirm this is your voice, or that you have permission to clone it.");
      return;
    }

    setIsSaving(true);
    setError("");

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
      <small>BirthdayBot clones this account voice and reuses it for every future birthday message.</small>
      <p>
        Try: &quot;Happy birthday. I wanted this to feel more personal than a regular text,
        because you deserve something with a little sparkle in it.&quot;
      </p>
      <div className="bb-voice-actions">
        {recordingState === "recording" ? (
          <button className="bb-sticker-button" onClick={stopRecording}>Stop recording {formatDuration(seconds)}</button>
        ) : (
          <button className="bb-outline-button" onClick={startRecording} disabled={recordingState === "processing"}>
            <Icon name="mic" /> {sampleDataUrl ? "Record again" : "Record voice"}
          </button>
        )}
        <label className="bb-outline-button">
          <Icon name="upload" /> Upload
          <input type="file" accept="audio/*,video/mp4,video/quicktime" onChange={onUpload} />
        </label>
      </div>
      {sampleName ? <small className="bb-selected-sample">Selected: {sampleName}</small> : null}
      <label className="bb-consent-row">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>I confirm this is my voice, or I have permission to clone and use it.</span>
      </label>
      {error ? <small className="bb-generation-error">{error}</small> : null}
      <button className="bb-sticker-button" onClick={saveVoiceClone} disabled={isSaving || recordingState !== "idle"}>
        <Icon name="check" /> {isSaving ? "Cloning voice..." : "Save voice clone"}
      </button>
    </section>
  );
}

function DetailView({ id, setView }: { id: number; setView: (view: View) => void }) {
  const friend = friends.find((item) => item.id === id) ?? friends[0];

  return (
    <div className="bb-scroll-view">
      <header className="bb-detail-bar">
        <button className="bb-text-button" onClick={() => setView({ name: "dashboard" })}><Icon name="arrowLeft" /> Dashboard</button>
      </header>
      <section className="bb-detail-layout">
        <div className={`bb-postcard swatch-${friend.color} is-detail`}>
          {friend.demoVideoUrl ? (
            <video className="bb-generated-video" controls playsInline src={friend.demoVideoUrl} />
          ) : (
            <>
              <Photo friend={friend} size="fill" />
              <div className="bb-postcard-shade" />
              <PlayButton />
              <PostcardCaption friend={friend} />
            </>
          )}
        </div>
        <div className="bb-detail-copy">
          <p className="bb-kicker">{countdown(friend.daysUntil)} * {friend.relation}</p>
          <h1>{friend.firstName} turns {friend.age}</h1>
          <p>&quot;{friend.message || "Add a message before scheduling."}&quot;</p>
          <section className="bb-recipe-card">
            <Recipe label="Photo" value={`${friend.firstName.toLowerCase()}.jpg`} ok={friend.photo} />
            <Recipe label="Voice" value="your cloned voice * saved" ok />
            <Recipe label="Message" value={friend.message ? `${friend.message.length} characters` : "missing"} ok={Boolean(friend.message)} />
            <Recipe label="Style" value={styleLabel(friend.style)} ok={Boolean(friend.style)} />
            <Recipe label="Sends" value={`${friend.dateLong} * ${friend.delivery}`} ok />
          </section>
          <div className="bb-detail-actions">
            <button
              className="bb-sticker-button"
              onClick={() => {
                clearWizardSnapshot();
                setView({ name: "wizard", step: 0, friend });
              }}
            ><Icon name="edit" /> Edit video</button>
            <button className="bb-outline-button">Send a preview to me</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CalendarView({ setView }: { setView: (view: View) => void }) {
  const months = ["May", "June", "July"];
  const daysByMonth: Record<string, number> = { May: 31, June: 30, July: 31 };

  return (
    <PageFrame eyebrow="Calendar" title="Three months of birthday insurance.">
      <div className="bb-month-stack">
        {months.map((month, monthIndex) => (
          <section className="bb-month" key={month}>
            <h2>{month} 2026</h2>
            <div className="bb-days">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <strong key={`${day}-${index}`}>{day}</strong>)}
              {Array.from({ length: 35 }).map((_, index) => {
                const day = index + 1 <= daysByMonth[month] ? index + 1 : "";
                const friend = friends.find((item) => item.date.startsWith(month.slice(0, 3)) && Number(item.date.replace(/\D/g, "")) === day);
                return (
                  <button
                    key={`${month}-${index}`}
                    className={friend ? `has-birthday swatch-${friend.color}` : ""}
                    disabled={!day}
                    onClick={() => friend && setView({ name: "detail", id: friend.id })}
                  >
                    {day}
                    {friend ? <span>{friend.firstName}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PageFrame>
  );
}

function SettingsView({ voiceClone }: { voiceClone: VoiceCloneState }) {
  return (
    <PageFrame eyebrow="Settings" title="The reusable parts of every birthday.">
      <section className="bb-settings-card">
        {[
          ["Voice clone", voiceClone.ready ? `Active * ${voiceClone.voiceCloneName || "saved"}` : "Not set up yet", "mic"],
          ["Send time", "9:00 AM recipient time", "clock"],
          ["Delivery default", "Text first, email fallback", "send"],
          ["Watermark", "Tiny BirthdayBot tag", "sparkle"],
          ["Family calendar", "Connected", "calendar"]
        ].map(([label, value, icon]) => (
          <button key={label}>
            <Icon name={icon as IconName} />
            <span><strong>{label}</strong><small>{value}</small></span>
            <Icon name="arrowRight" />
          </button>
        ))}
      </section>
    </PageFrame>
  );
}

function SimpleListView({
  title,
  eyebrow,
  items,
  setView
}: {
  title: string;
  eyebrow: string;
  items: Friend[];
  setView: (view: View) => void;
}) {
  return (
    <PageFrame eyebrow={eyebrow} title={title}>
      <div className="bb-card-grid">
        {items.map((friend) => (
          <BirthdayCard key={friend.id} friend={friend} onClick={() => setView({ name: "detail", id: friend.id })} />
        ))}
      </div>
    </PageFrame>
  );
}

function SentView() {
  return (
    <PageFrame eyebrow="Recently sent" title="Proof the little system works.">
      <div className="bb-card-grid">
        {recentlySent.map((sent) => (
          <article className="bb-birthday-card" key={sent.name}>
            <span className="bb-card-top">
              <Photo friend={{ ...blankFriend(), ...sent, id: sent.age, firstName: sent.name, status: "sent", photo: true, message: "", style: "lip-sync", delivery: "text", dateLong: sent.date, daysUntil: 0 }} size="thumb" />
              <span><strong>{sent.name}</strong><small>sent {sent.date}</small></span>
            </span>
            <span className="bb-card-mid">
              <span><small>reaction</small><strong>{sent.reaction}</strong></span>
              <StatusChip status="sent" />
            </span>
          </article>
        ))}
      </div>
    </PageFrame>
  );
}

function PageFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="bb-scroll-view">
      <section className="bb-page-frame">
        <p className="bb-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </div>
  );
}

function Heading({ kicker, title, sub }: { kicker: string; title: ReactNode; sub: string }) {
  return (
    <header className="bb-step-heading">
      <p className="bb-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{sub}</p>
    </header>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="bb-field">
      <span>{label}{hint ? <small>{hint}</small> : null}</span>
      {children}
    </label>
  );
}

function Photo({ friend, size }: { friend: Friend; size: "fill" | "feature" | "photo" | "thumb" | "small" }) {
  const initials = friend.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <span className={`bb-photo bb-photo-${size} swatch-${friend.color}`}>
      {friend.photoDataUrl ? <img src={friend.photoDataUrl} alt="" /> : null}
      {!friend.photoDataUrl ? <b>{initials}</b> : null}
    </span>
  );
}

function Stamp({ age }: { age: Friend["age"] }) {
  return (
    <span className="bb-stamp">
      <small>BIRTHDAY</small>
      <strong>{age || "*"}</strong>
      <small>BOT * *</small>
    </span>
  );
}

function PlayButton() {
  return <span className="bb-play-button"><Icon name="play" /></span>;
}

function PostcardCaption({ friend }: { friend: Friend }) {
  return (
    <span className="bb-postcard-caption">
      <small>{friend.dateLong || friend.date} * delivers 9 AM</small>
      <strong>Happy birthday, {friend.firstName || "friend"}!</strong>
      <em>0:23 * {friend.style || "sing-along"} * your voice</em>
    </span>
  );
}

function StatusChip({ status }: { status: FriendStatus }) {
  return <span className={`bb-status bb-status-${status}`}>{status}</span>;
}

function ReadyDot({ on, label }: { on: boolean; label: string }) {
  return <span className={on ? "is-ready" : ""}><i />{label}</span>;
}

function Recipe({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span className="bb-recipe-row">
      <i className={ok ? "ok" : ""}>{ok ? <Icon name="check" /> : null}</i>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <header className="bb-section-head">
      <h2>{label}</h2>
      <span>* {count}</span>
    </header>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function Confetti({ density }: { density: number }) {
  return (
    <div className="bb-confetti" aria-hidden>
      {Array.from({ length: density }).map((_, index) => (
        <i
          key={index}
          className={`c${index % 5} s${index % 4}`}
          style={{
            left: `${(index * 37) % 100}%`,
            animationDelay: `${-((index * 19) % 90) / 10}s`,
            animationDuration: `${6 + (index % 7)}s`,
            ["--drift" as string]: `${-34 + ((index * 17) % 68)}px`,
            ["--spin" as string]: `${(index * 29) % 360}deg`
          }}
        />
      ))}
    </div>
  );
}

function ConfettiBurst() {
  return (
    <span className="bb-confetti-burst" aria-hidden>
      {Array.from({ length: 18 }).map((_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}
    </span>
  );
}

type IconName =
  | "arrowLeft"
  | "arrowRight"
  | "calendar"
  | "check"
  | "clock"
  | "edit"
  | "list"
  | "message"
  | "mic"
  | "music"
  | "play"
  | "plus"
  | "send"
  | "settings"
  | "sparkle"
  | "upload"
  | "x";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string[]> = {
    arrowLeft: ["M19 12H5", "M11 6l-6 6 6 6"],
    arrowRight: ["M5 12h14", "M13 6l6 6-6 6"],
    calendar: ["M3 6h18v15H3z", "M8 3v4", "M16 3v4", "M3 10h18"],
    check: ["M20 6L9 17l-5-5"],
    clock: ["M12 7v5l3 2", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
    edit: ["M11 4H4v16h16v-7", "M18 2l4 4-9 9H9v-4z"],
    list: ["M3 7h18", "M3 12h12", "M3 17h18"],
    message: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
    mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
    music: ["M9 18V5l12-2v13", "M9 18a3 3 0 1 1-2-2.83", "M21 16a3 3 0 1 1-2-2.83"],
    play: ["M7 4l14 8-14 8z"],
    plus: ["M12 5v14", "M5 12h14"],
    send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
    settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19 12a7 7 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6c0-.4.1-.8.1-1.2z"],
    sparkle: ["M12 3l1.5 5L19 9l-5.5 1L12 15l-1.5-5L5 9l5.5-1z", "M18 16l.7 2.3L21 19l-2.3.7L18 22l-.7-2.3L15 19l2.3-.7z"],
    upload: ["M12 15V3", "M7 8l5-5 5 5", "M3 17v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3"],
    x: ["M18 6L6 18", "M6 6l12 12"]
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function blankFriend(): Friend {
  return {
    id: 99,
    name: "",
    firstName: "",
    date: "",
    dateLong: "",
    daysUntil: 0,
    age: "",
    relation: "Friend",
    status: "draft",
    photo: false,
    color: "pink",
    message: "",
    style: "",
    delivery: "text"
  };
}

function buildSimpleDraftRequest(friend: Friend, voiceClone: VoiceCloneState): DraftRequest {
  const name = friend.firstName || firstName(friend.name) || friend.name;
  const userPrompt = friend.message?.trim() || `Make a warm birthday video for ${name || "my friend"}.`;
  const directives = buildPromptDirectives(friend);
  const prompt = directives ? `${userPrompt}\n\n${directives}` : userPrompt;

  return {
    mode: "simple",
    birthdayName: name,
    prompt,
    photoName: friend.photoName || `${name || "birthday"}-photo.png`,
    photoDataUrl: friend.photoDataUrl || "",
    voiceSampleName: voiceClone.voiceSampleName,
    voiceSampleDataUrl: voiceClone.voiceSampleDataUrl,
    voiceConsent: Boolean(voiceClone.voiceSampleDataUrl),
    voiceCloneId: voiceClone.providerVoiceId,
    voiceCloneName: voiceClone.voiceCloneName,
    voiceMode: "narrate",
    advanced: defaultAdvancedSettings
  };
}

function buildPromptDirectives(friend: Friend): string {
  const parts: string[] = [];

  const accentList = [
    ...(friend.accents ?? []),
    ...((friend.accentsOther || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean))
  ];
  if (accentList.length > 0) {
    parts.push(`Accents: ${accentList.join(", ")}.`);
  }

  const vibe = (friend.vibeOther || friend.vibe || "").trim();
  if (vibe) {
    parts.push(`Vibe: ${vibe}.`);
  }

  const setting = (friend.settingOther || friend.setting || "").trim();
  if (setting) {
    parts.push(`Setting: ${setting}.`);
  }

  const music = (friend.musicGenreOther || friend.musicGenre || "").trim();
  if (music) {
    parts.push(`Music: ${music}.`);
  }

  return parts.join(" ");
}

function buildDraftRequest(friend: Friend, voiceClone: VoiceCloneState): DraftRequest {
  const name = friend.firstName || firstName(friend.name);
  const style = styleLabel(friend.style).toLowerCase();
  const voiceMode = friend.style === "sing-along" ? "song" : "narrate";

  return {
    mode: "advanced",
    birthdayName: name,
    prompt: [
      friend.message || `Make a warm birthday video for ${name || "my friend"}.`,
      `Style: ${style}.`,
      `Relation: ${friend.relation}.`,
      "Use a cheerful birthday-party look with confetti, candles, and a sendable personal feel."
    ].join(" "),
    photoName: friend.photoName || `${name || "birthday"}-photo.png`,
    photoDataUrl: friend.photoDataUrl || "",
    voiceSampleName: voiceClone.voiceSampleName,
    voiceSampleDataUrl: voiceClone.voiceSampleDataUrl,
    voiceConsent: Boolean(voiceClone.voiceSampleDataUrl),
    voiceMode,
    songStyle: "Acoustic",
    advanced: {
      ...defaultAdvancedSettings,
      tone: friend.style === "serenade" ? "Sentimental" : "Heartfelt",
      musicVibe: friend.style === "lip-sync" ? "Playful" : "Uplifting",
      videoLength: "15 seconds",
      aspectRatio: "Portrait",
      motionIntensity: friend.style === "lip-sync" ? "Subtle" : "Moderate"
    }
  };
}

async function pollGenerationJob(
  initialJob: JobRecord,
  planRecord: PlanRecord,
  onJob: (job: JobRecord) => void
) {
  let latestJob = initialJob;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wait(3000);
    const job = await studioApi.checkJob({ job: latestJob, plan: planRecord });
    latestJob = job;

    onJob(job);

    if (job.stage === "completed" || job.stage === "failed") {
      return job;
    }
  }

  throw new Error("Generation is still running. Check back in a moment for the final video.");
}

function readVoiceSetup(): VoiceCloneState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(voiceSetupStorageKey);
    if (!raw) {
      return null;
    }

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

const wizardSnapshotKey = "birthdaybot:wizard-state";
const wizardSnapshotTtlMs = 2 * 60 * 60 * 1000; // 2 hours

type WizardSnapshot = {
  draft: Friend;
  briefPlan: AgentPlan | null;
  briefCaption: string;
  briefRequestId: string;
  briefDraft: DraftRequest | null;
  generation: GenerationState;
};

function readWizardSnapshot(): Partial<WizardSnapshot> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(wizardSnapshotKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: Partial<WizardSnapshot> };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > wizardSnapshotTtlMs) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeWizardSnapshot(data: Partial<WizardSnapshot>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      wizardSnapshotKey,
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    // Quota exceeded; silently skip — the in-memory flow keeps working.
  }
}

function clearWizardSnapshot() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(wizardSnapshotKey);
  } catch {
    // ignore
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function countdown(days: number) {
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  if (days < 7) return `IN ${days} DAYS`;
  if (days < 14) return "NEXT WEEK";
  if (days < 35) return `IN ${Math.round(days / 7)} WEEKS`;
  return `IN ${Math.round(days / 30)} MONTHS`;
}

function firstName(name: string) {
  return name.trim().split(" ")[0] || "";
}

function styleLabel(style: Friend["style"]) {
  return styles.find((item) => item.id === style)?.label ?? "-";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
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

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

const MAX_PHOTO_LONG_EDGE = 1280;
const PHOTO_JPEG_QUALITY = 0.8;
const SAFE_DATA_URL_BYTES = 3.0 * 1024 * 1024;

async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (typeof window === "undefined") {
    return fileToDataUrl(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    return compressBitmap(bitmap);
  } catch {
    return fileToDataUrl(file);
  }
}

async function ensureSafePhotoDataUrl(dataUrl: string): Promise<string> {
  if (typeof window === "undefined") {
    return dataUrl;
  }
  if (dataUrl.length <= SAFE_DATA_URL_BYTES) {
    return dataUrl;
  }

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    return compressBitmap(bitmap);
  } catch {
    return dataUrl;
  }
}

function compressBitmap(bitmap: ImageBitmap): string {
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > MAX_PHOTO_LONG_EDGE ? MAX_PHOTO_LONG_EDGE / longEdge : 1;
  const targetWidth = Math.round(bitmap.width * scale);
  const targetHeight = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable.");
  }
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  let quality = PHOTO_JPEG_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > SAFE_DATA_URL_BYTES && quality > 0.5) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function stopVoiceStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
