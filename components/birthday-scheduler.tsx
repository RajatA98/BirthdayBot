"use client";

import React, { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { studioApi, StudioApi } from "@/lib/client-api";
import {
  BirthdayDelivery,
  BirthdayProfile,
  BirthdayProfileInput
} from "@/lib/types";

type BirthdayFormErrors = {
  name?: string;
  relationship?: string;
  birthday?: string;
  deliveryEmail?: string;
  photo?: string;
};

const initialForm = {
  name: "",
  relationship: "",
  birthday: "",
  deliveryEmail: "",
  customPrompt: "",
  photoName: "",
  photoDataUrl: "",
  autoSend: true
};

export function BirthdayScheduler({ api = studioApi }: { api?: StudioApi }) {
  const [form, setForm] = useState<BirthdayProfileInput>(initialForm);
  const [profiles, setProfiles] = useState<BirthdayProfile[]>([]);
  const [deliveries, setDeliveries] = useState<BirthdayDelivery[]>([]);
  const [errors, setErrors] = useState<BirthdayFormErrors>({});
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      try {
        const response = await api.listBirthdayProfiles();

        if (!cancelled) {
          setProfiles(response.profiles);
          setDeliveries(response.deliveries);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Birthday schedule could not be loaded."
          );
        }
      }
    }

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const nextBirthday = useMemo(() => profiles[0], [profiles]);

  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      setForm((current) => ({ ...current, photoName: "", photoDataUrl: "" }));
      return;
    }

    setForm((current) => ({
      ...current,
      photoName: nextFile.name,
      photoDataUrl: ""
    }));
    const photoDataUrl = await fileToDataUrl(nextFile);
    setForm((current) => ({ ...current, photoDataUrl }));
    setErrors((current) => ({ ...current, photo: undefined }));
  }

  function validate() {
    const nextErrors: BirthdayFormErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Add their name.";
    }

    if (!form.relationship.trim()) {
      nextErrors.relationship = "Add your relationship.";
    }

    if (!form.birthday) {
      nextErrors.birthday = "Add their birthday.";
    }

    if (!form.deliveryEmail.includes("@")) {
      nextErrors.deliveryEmail = "Add the email where you want the video.";
    }

    if (!form.photoDataUrl) {
      nextErrors.photo = "Add a photo for their birthday video.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSaving(true);
    setStatus("");

    try {
      const response = await api.createBirthdayProfile(form);
      setProfiles(response.profiles);
      setDeliveries(response.deliveries);
      setForm(initialForm);
      setStatus(`${form.name.trim()} is on the birthday schedule.`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Birthday profile could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function runDueBirthdays() {
    setIsRunning(true);
    setStatus("");

    try {
      const response = await api.runBirthdayAutomation();
      const refreshed = await api.listBirthdayProfiles();
      setProfiles(refreshed.profiles);
      setDeliveries(refreshed.deliveries);
      setStatus(
        response.generated.length
          ? `${response.generated.length} birthday video run started.`
          : "No birthdays are due today."
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Birthday automation failed."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="birthday-scheduler">
      <div className="scheduler-header">
        <div>
          <p className="summary-label">Birthday autopilot</p>
          <h2>Scheduled birthday videos</h2>
        </div>
        <button
          className="ghost-action"
          type="button"
          aria-disabled="true"
          title="Google Contacts import needs Google OAuth setup."
        >
          Google Contacts
        </button>
      </div>

      <form className="scheduler-form" onSubmit={saveProfile} noValidate>
        <label className="field">
          <span>Name</span>
          <input
            aria-label="Birthday person name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        {errors.name ? <p className="field-error">{errors.name}</p> : null}

        <label className="field">
          <span>Relationship</span>
          <input
            aria-label="Relationship"
            placeholder="Best friend, sister, dad"
            value={form.relationship}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                relationship: event.target.value
              }))
            }
          />
        </label>
        {errors.relationship ? (
          <p className="field-error">{errors.relationship}</p>
        ) : null}

        <div className="scheduler-grid">
          <label className="field">
            <span>Birthday</span>
            <input
              aria-label="Birthday"
              type="date"
              value={form.birthday}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  birthday: event.target.value
                }))
              }
            />
          </label>

          <label className="field">
            <span>Send to</span>
            <input
              aria-label="Delivery email"
              type="email"
              placeholder="you@example.com"
              value={form.deliveryEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  deliveryEmail: event.target.value
                }))
              }
            />
          </label>
        </div>
        {errors.birthday ? <p className="field-error">{errors.birthday}</p> : null}
        {errors.deliveryEmail ? (
          <p className="field-error">{errors.deliveryEmail}</p>
        ) : null}

        <label className="field">
          <span>Custom prompt</span>
          <textarea
            aria-label="Custom birthday prompt"
            rows={3}
            placeholder="Make it feel like a funny family dinner montage with warm music."
            value={form.customPrompt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                customPrompt: event.target.value
              }))
            }
          />
        </label>

        <label className="upload-card" htmlFor="birthday-photo-upload">
          <span className="upload-title">Birthday photo</span>
          <span className="upload-meta">
            {form.photoName ? `Selected: ${form.photoName}` : "Choose a photo"}
          </span>
        </label>
        <input
          id="birthday-photo-upload"
          type="file"
          accept="image/*"
          aria-label="Birthday photo"
          onChange={onPhotoChange}
        />
        {errors.photo ? <p className="field-error">{errors.photo}</p> : null}

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.autoSend}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                autoSend: event.target.checked
              }))
            }
          />
          <span>Automatically generate on their birthday</span>
        </label>

        <button className="primary-action" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add birthday"}
        </button>
      </form>

      <section className="summary-card">
        <p className="summary-label">Next up</p>
        <p>
          {nextBirthday
            ? `${nextBirthday.name} (${nextBirthday.relationship}) on ${formatBirthday(
                nextBirthday.birthday
              )}`
            : "No birthdays scheduled yet."}
        </p>
      </section>

      <div className="action-row">
        <button
          className="ghost-action"
          type="button"
          onClick={runDueBirthdays}
          disabled={isRunning}
        >
          {isRunning ? "Checking today..." : "Generate due videos now"}
        </button>
      </div>

      {status ? <p className="success-note">{status}</p> : null}

      <BirthdayList profiles={profiles} />
      <DeliveryList deliveries={deliveries} />
    </section>
  );
}

function BirthdayList({ profiles }: { profiles: BirthdayProfile[] }) {
  if (!profiles.length) {
    return null;
  }

  return (
    <section className="compact-list" aria-label="Birthday schedule">
      {profiles.map((profile) => (
        <article className="compact-item" key={profile.id}>
          <div>
            <strong>{profile.name}</strong>
            <span>
              {profile.relationship} - {formatBirthday(profile.birthday)}
            </span>
          </div>
          <span>{profile.autoSend ? "Auto" : "Paused"}</span>
        </article>
      ))}
    </section>
  );
}

function DeliveryList({ deliveries }: { deliveries: BirthdayDelivery[] }) {
  if (!deliveries.length) {
    return null;
  }

  return (
    <section className="compact-list" aria-label="Birthday video deliveries">
      {deliveries.slice(0, 3).map((delivery) => (
        <article className="compact-item" key={delivery.id}>
          <div>
            <strong>{delivery.profileName}</strong>
            <span>{delivery.deliveryEmail}</span>
          </div>
          <span>{delivery.status}</span>
        </article>
      ))}
    </section>
  );
}

function formatBirthday(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}
