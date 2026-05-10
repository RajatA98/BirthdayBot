"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { studioApi } from "@/lib/client-api";
import { defaultAdvancedSettings } from "@/lib/defaults";
import { AgentPlan, DraftRequest, JobRecord } from "@/lib/types";

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
};

type VoiceCloneState = {
  ready: boolean;
  voiceCloneId?: string;
  voiceCloneName?: string;
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
  ["Message", "What to say"],
  ["Preview", "Send it"]
];

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
    let cancelled = false;

    async function loadVoiceClone() {
      try {
        const response = await fetch("/api/voice-clone");
        const clone = (await response.json()) as VoiceCloneState;

        if (!cancelled && clone.ready) {
          setVoiceClone(clone);
        }
      } catch {
        // The setup card can still create the voice clone if status lookup fails.
      }
    }

    loadVoiceClone();

    return () => {
      cancelled = true;
    };
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

      <button className="bb-sticker-button" onClick={() => setView({ name: "wizard", step: 0, friend: blankFriend() })}>
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
          onEdit={() => setView({ name: "wizard", step: 2, friend: hero })}
        />

        <section className="bb-section">
          <SectionHead label="Also this week" count={2} />
          <div className="bb-this-week-grid">
            <FeaturedCard friend={friends[1]} onClick={() => setView({ name: "detail", id: friends[1].id })} />
            <NudgeCard onClick={() => setView({ name: "wizard", step: 0, friend: blankFriend() })} />
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
  const step = view.step;

  useEffect(() => {
    if (!generating) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + 7);
        if (next === 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setGenerating(false), 350);
        }
        return next;
      });
    }, 220);

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

  async function generateVideo() {
    if (!draft.photoDataUrl) {
      setGeneration({
        phase: "failed",
        message: "Upload a real photo before generating the video.",
        error: "The dashboard placeholder looks cute, but fal.ai needs an uploaded image file."
      });
      return;
    }

    if (!voiceClone.ready || !voiceClone.voiceCloneId) {
      setGeneration({
        phase: "failed",
        message: "Set up your voice clone once before generating this birthday video.",
        error: "Record or upload a short voice sample below. BirthdayBot will reuse it for future birthday videos."
      });
      return;
    }

    const requestDraft = buildDraftRequest(draft, voiceClone);

    try {
      setGeneration({
        phase: "planning",
        message: "Building the birthday brief."
      });

      const planResponse = await studioApi.createPlan(requestDraft);

      setGeneration({
        phase: "generating",
        message: "Starting video generation.",
        requestId: planResponse.requestId,
        plan: planResponse.plan,
        caption: planResponse.caption
      });

      const generationResponse = await studioApi.startGeneration({
        requestId: planResponse.requestId,
        draft: requestDraft,
        plan: planResponse.plan,
        caption: planResponse.caption
      });

      await pollGenerationJob(generationResponse.jobId, (job) => {
        setGeneration({
          phase: job.stage === "completed" ? "completed" : job.stage === "failed" ? "failed" : "generating",
          message: job.statusMessage,
          requestId: planResponse.requestId,
          plan: planResponse.plan,
          caption: job.caption || planResponse.caption,
          job,
          videoUrl: job.videoUrl,
          voiceOverUrl: job.voiceOverUrl,
          error: job.error || job.voiceOverError
        });
      });
    } catch (error) {
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
        {step === 2 ? <StepMessage draft={draft} update={update} /> : null}
        {step === 3 ? (
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
        <span>step {step + 1} of 4</span>
        {step < 3 ? (
          <button className="bb-sticker-button" onClick={() => go(step + 1)}>
            Next <Icon name="arrowRight" />
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
    update({ photo: true, photoName: file.name, photoDataUrl: await fileToDataUrl(file) });
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

function StepMessage({ draft, update }: { draft: Friend; update: (patch: Partial<Friend>) => void }) {
  return (
    <section className="bb-step-panel">
      <Heading
        kicker="Step 3 * Words & vibe"
        title={<>What should the <mark className="pink">message</mark> say?</>}
        sub="Type it the way you'd say it. We'll match the cadence to your saved voice clone."
      />
      <Field label="Message" hint={`${draft.message.length} / 280`}>
        <textarea
          value={draft.message}
          maxLength={280}
          onChange={(event) => update({ message: event.target.value })}
          placeholder="Maya!! Another year of being my favorite kind of chaos. Hope your 31st is full of cold martinis..."
        />
      </Field>
      <div className="bb-rewrite-row">
        {["Make it shorter", "Funnier", "More heartfelt", "Add an inside joke"].map((label) => (
          <button key={label}><Icon name="sparkle" /> {label}</button>
        ))}
      </div>
      <div className="bb-style-grid">
        {styles.map((style) => (
          <button
            key={style.id}
            className={draft.style === style.id ? "is-selected" : ""}
            onClick={() => update({ style: style.id })}
          >
            <Icon name={style.icon} />
            <strong>{style.label}</strong>
            <small>{style.hint}</small>
            {draft.style === style.id ? <em><Icon name="check" /></em> : null}
          </button>
        ))}
      </div>
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
            <video className="bb-generated-video" controls playsInline src={generation.videoUrl} />
          ) : (
            <Photo friend={{ ...draft, photo: true }} size="fill" />
          )}
          {!generation.videoUrl ? <div className="bb-postcard-shade" /> : null}
          {!generating && !isGenerating && !generation.videoUrl ? <PlayButton /> : null}
          {generating || isGenerating ? (
            <div className="bb-rendering">
              <span />
              <strong>{isGenerating ? generation.message : stage}</strong>
              <i><b style={{ width: `${isGenerating ? 64 : progress}%` }} /></i>
            </div>
          ) : null}
          {!generation.videoUrl ? <PostcardCaption friend={draft} /> : null}
        </div>
        <aside className="bb-preview-side">
          {!voiceClone.ready ? (
            <VoiceSetupCard onReady={onVoiceCloneReady} />
          ) : (
            <section className="bb-voice-ready-card">
              <span className="bb-card-heading">Account voice</span>
              <strong>Voice clone ready</strong>
              <small>{voiceClone.voiceCloneName || "Saved voice"} will be reused for every birthday video.</small>
            </section>
          )}
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
              value={voiceClone.ready ? "your cloned voice * saved" : "set up once above"}
              ok={voiceClone.ready}
            />
            <Recipe label="Message" value={draft.message || "Needs message"} ok={Boolean(draft.message)} />
            <Recipe label="Style" value={styleLabel(draft.style)} ok={Boolean(draft.style)} />
          </section>
          <section className={`bb-generation-card is-${generation.phase}`}>
            <span className="bb-card-heading">Video output</span>
            <strong>{generation.phase === "completed" ? "Video ready" : generation.phase === "failed" ? "Needs attention" : "Generate video"}</strong>
            <small>{generation.error || generation.message}</small>
            {generation.voiceOverUrl ? <audio controls src={generation.voiceOverUrl} /> : null}
            <button
              className="bb-sticker-button"
              onClick={generateVideo}
              disabled={isGenerating}
            >
              <Icon name="play" /> {isGenerating ? "Generating..." : generation.videoUrl ? "Generate again" : "Generate birthday video"}
            </button>
          </section>
          <button className="bb-outline-button" onClick={start}><Icon name="sparkle" /> Regenerate preview</button>
        </aside>
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

    try {
      const response = await fetch("/api/voice-clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceSampleName: sampleName,
          voiceSampleDataUrl: sampleDataUrl,
          voiceConsent: consent
        })
      });
      const body = (await response.json()) as VoiceCloneState & { error?: string };

      if (!response.ok || !body.ready) {
        throw new Error(body.error || "Voice clone could not be created.");
      }

      onReady(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Voice clone could not be created.");
    } finally {
      setIsSaving(false);
    }
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
            <button className="bb-sticker-button" onClick={() => setView({ name: "wizard", step: 0, friend })}><Icon name="edit" /> Edit video</button>
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
    style: "sing-along",
    delivery: "text"
  };
}

function buildDraftRequest(friend: Friend, voiceClone: VoiceCloneState): DraftRequest {
  const name = friend.firstName || firstName(friend.name);
  const style = styleLabel(friend.style).toLowerCase();

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
    voiceCloneId: voiceClone.voiceCloneId,
    voiceCloneName: voiceClone.voiceCloneName,
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

async function pollGenerationJob(jobId: string, onJob: (job: JobRecord) => void) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await wait(2200);
    const job = await studioApi.getJob(jobId);

    onJob(job);

    if (job.stage === "completed" || job.stage === "failed") {
      return job;
    }
  }

  throw new Error("Generation is still running. Check back in a moment for the final video.");
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

function stopVoiceStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
