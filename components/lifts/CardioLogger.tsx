"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCollection, addItem } from "@/lib/data";
import { nowStamp, todayISO } from "@/lib/lifts";
import {
  parseDurationToMin,
  paceToMin,
  cardioDistanceMi,
  fmtPace,
  isRacketSport,
  CARDIO_KIND_LABEL,
  type CardioKind,
  type CardioLog,
} from "@/lib/cardio";

const KINDS: CardioKind[] = ["outdoor", "treadmill", "pickleball", "tennis", "other"];

export default function CardioLogger() {
  const router = useRouter();
  const { uid } = useCollection<CardioLog>("cardio");

  const [kind, setKind] = useState<CardioKind>("outdoor");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(""); // duration, "MM:SS" or minutes
  const [incline, setIncline] = useState(""); // %
  const [speed, setSpeed] = useState(""); // mph
  const [pace, setPace] = useState(""); // "MM:SS" /mi
  const [activity, setActivity] = useState(""); // other
  const [notes, setNotes] = useState(""); // other/racket — free-text
  const [playedWith, setPlayedWith] = useState(""); // racket sports
  const [wins, setWins] = useState(""); // racket sports
  const [losses, setLosses] = useState(""); // racket sports
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const durationMin = parseDurationToMin(time);
  const dist =
    durationMin > 0
      ? cardioDistanceMi({ kind, durationMin, speedMph: parseFloat(speed) || 0, pace } as CardioLog)
      : null;

  const save = async () => {
    if (!uid) return;
    setError("");
    if (durationMin <= 0) return setError("Enter how long you went.");
    if (kind === "treadmill" && !(parseFloat(speed) > 0)) return setError("Enter the treadmill speed.");
    if (kind === "outdoor" && !(paceToMin(pace) > 0)) return setError("Enter your pace (MM:SS per mile).");
    if (kind === "other" && !activity.trim()) return setError("Enter the activity.");

    const payload: Record<string, unknown> = {
      date,
      dateTime: nowStamp(date),
      kind,
      durationMin: Math.round(durationMin * 100) / 100,
    };
    if (kind === "treadmill") {
      payload.inclinePct = parseFloat(incline) || 0;
      payload.speedMph = parseFloat(speed) || 0;
    } else if (kind === "outdoor") {
      payload.pace = pace.trim();
    } else if (isRacketSport(kind)) {
      if (playedWith.trim()) payload.playedWith = playedWith.trim();
      if (wins.trim()) payload.wins = parseInt(wins, 10) || 0;
      if (losses.trim()) payload.losses = parseInt(losses, 10) || 0;
      if (notes.trim()) payload.notes = notes.trim();
    } else {
      payload.activity = activity.trim();
      if (notes.trim()) payload.notes = notes.trim();
    }

    setSaving(true);
    try {
      await addItem(uid, "cardio", payload);
      router.push("/lifts");
    } catch (e) {
      setSaving(false);
      setError("Could not save. Try again.");
      console.error(e);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Log cardio</h1>
        <p className="text-sm text-muted">Run, treadmill, or another activity.</p>
      </header>

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-bg p-0.5 sm:grid-cols-5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`whitespace-nowrap rounded-md px-2 py-2 text-xs font-semibold transition ${
                kind === k ? "bg-card text-ink shadow-card" : "text-muted"
              }`}
            >
              {CARDIO_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </Field>

        {kind === "other" && (
          <Field label="Activity" hint="e.g. Tennis, Basketball">
            <input placeholder="Tennis" value={activity} onChange={(e) => setActivity(e.target.value)} className="input" />
          </Field>
        )}

        {isRacketSport(kind) && (
          <Field label="Played with" hint="optional">
            <input placeholder="Mom, Dave" value={playedWith} onChange={(e) => setPlayedWith(e.target.value)} className="input" />
          </Field>
        )}

        <Field label="Time" hint="how long — e.g. 45 or 45:00">
          <input inputMode="numeric" placeholder="45:00" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
        </Field>

        {kind === "treadmill" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Speed (mph)">
              <input inputMode="decimal" placeholder="6.0" value={speed} onChange={(e) => setSpeed(e.target.value)} className="input" />
            </Field>
            <Field label="Incline (%)">
              <input inputMode="decimal" placeholder="3.0" value={incline} onChange={(e) => setIncline(e.target.value)} className="input" />
            </Field>
          </div>
        )}

        {kind === "outdoor" && (
          <Field label="Pace (/mi)" hint="minutes:seconds per mile">
            <input inputMode="numeric" placeholder="8:30" value={pace} onChange={(e) => setPace(e.target.value)} className="input" />
          </Field>
        )}

        {isRacketSport(kind) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wins" hint="games won">
              <input inputMode="numeric" placeholder="3" value={wins} onChange={(e) => setWins(e.target.value)} className="input" />
            </Field>
            <Field label="Losses" hint="games lost">
              <input inputMode="numeric" placeholder="1" value={losses} onChange={(e) => setLosses(e.target.value)} className="input" />
            </Field>
          </div>
        )}

        {(kind === "other" || isRacketSport(kind)) && (
          <Field label="Notes" hint="optional">
            <textarea
              rows={3}
              placeholder="How it went, who you played with, anything worth remembering…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
            />
          </Field>
        )}

        {dist !== null && (
          <p className="text-sm text-muted">
            ≈ <span className="font-semibold text-ink">{dist.toFixed(2)} mi</span>
            {kind === "treadmill" && parseFloat(speed) > 0 && <> · {fmtPace(60 / parseFloat(speed))} /mi</>}
          </p>
        )}

        {error && <p className="text-sm text-coral">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={() => router.push("/lifts")} className="btn-ghost flex-1">Cancel</button>
          <button onClick={save} disabled={saving || !uid} className="btn-primary flex-[2] disabled:opacity-50">
            {saving ? "Saving…" : "Save cardio"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {hint && <span className="font-medium normal-case tracking-normal text-muted/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
