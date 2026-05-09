import { CreationForm } from "@/components/creation-form";

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">BirthdayBot</p>
        <h1>Turn one photo into a birthday video worth sending.</h1>
        <p className="lede">
          Upload a shared photo, describe the vibe, and let the agent shape a
          cinematic birthday moment.
        </p>
        <CreationForm />
      </section>
    </main>
  );
}
