"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCollection, addItem, updateItem, deleteItem, setItem } from "@/lib/data";
import { auth } from "@/lib/firebase/client";
import type {
  CoffeeLog,
  DinnerPlanLog,
  DrinkLog,
  FoodEntry,
  MoodLog,
  StepLog,
  WeightLog,
  Workout,
} from "@/lib/types";
import { MAX_STEPS_PER_DAY, STEP_LOGS, stepLogId } from "@/lib/steps";
import { DRINK_LOGS, drinkLogId, drinksByDate } from "@/lib/drinks";
import { addDays, prettyDate, prettyTime, sleepHours, todayStr } from "@/lib/dates";
import MoodChart from "@/components/charts/MoodChart";

// Mood and energy start unset: a check-in is only saved once you pick a mood,
// so nothing gets recorded as a "5" just because you opened the form.
const EMPTY_FORM = {
  mood: null as number | null,
  energy: null as number | null,
  caffeineCups: 0, // snapshot from coffeeLogs at save time
  bedtime: "",
  wakeTime: "",
  aiAnswer: "",
  notes: "",
};

interface InsightsDoc {
  id: string;
  summary: string;
  patterns: string[];
  generatedAt: string;
}

// Ask the section to open its form for a given day (e.g. from a calendar tap).
// `n` is a nonce so re-tapping the same day re-opens the form.
export interface OpenLogRequest {
  date: string;
  n: number;
}

export default function MoodSection({
  startDate,
  openRequest,
}: {
  startDate: string | null;
  openRequest?: OpenLogRequest | null;
}) {
  const today = todayStr();
  // Which day the form is logging for. Defaults to today, but any past day
  // can be picked to backfill or correct mood, drinks, sleep, etc.
  const [logDate, setLogDate] = useState(today);
  const isToday = logDate === today;
  const { data: logs, uid } = useCollection<MoodLog>("moodLogs");
  const { data: insightsDocs } = useCollection<InsightsDoc>("moodInsights");
  const insights = insightsDocs.find((d) => d.id === "latest");
  // Exercise is shared with the main page / Exercise section via the workouts
  // collection, so logging it anywhere keeps everything in sync.
  const { data: workouts } = useCollection<Workout>("workouts");
  const exercisedOnDate = workouts.some((w) => w.date === logDate);
  // Every "Log Coffee" tap is its own timestamped doc; the mood form just
  // reads "how many so far today" from here instead of asking.
  const { data: coffees } = useCollection<CoffeeLog>("coffeeLogs");
  const dateCoffees = useMemo(
    () =>
      coffees
        .filter((c) => c.date === logDate)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    [coffees, logDate]
  );
  const coffeeTimes = dateCoffees.map((c) => prettyTime(c.loggedAt));
  // Dinner plan is a shared per-day yes/no toggle (same source the Quick Log uses).
  const { data: dinnerPlans } = useCollection<DinnerPlanLog>("dinnerPlanLogs");
  const dinnerPlanOnDate = dinnerPlans.some((d) => d.date === logDate);
  // Drinks are their own per-day record (the day they were had), saved the
  // moment you tap a number — independent of the mood check-in.
  const { data: drinkLogs } = useCollection<DrinkLog>(DRINK_LOGS);
  const drinksOn = useMemo(() => drinksByDate(drinkLogs, logs), [drinkLogs, logs]);
  const drinksOnDate: number | undefined = drinksOn[logDate];

  // Food & body for the day being logged: calories/protein (foodEntries),
  // weight (weightLogs) and steps (stepLogs). Each field is null until edited,
  // so only what you actually typed gets written.
  const { data: foods } = useCollection<FoodEntry>("foodEntries");
  const { data: weights } = useCollection<WeightLog>("weightLogs");
  const { data: stepLogs } = useCollection<StepLog>(STEP_LOGS);
  const dayFoods = useMemo(() => foods.filter((f) => f.date === logDate), [foods, logDate]);
  const dayCalories = dayFoods.reduce((s, f) => s + (f.calories || 0), 0);
  const dayProtein = dayFoods.reduce((s, f) => s + (f.proteinG ?? 0), 0);
  const dayWeight = weights.find((w) => w.date === logDate);
  const daySteps = stepLogs.find((s) => s.date === logDate);
  const EMPTY_BODY = { calories: null, protein: null, weight: null, steps: null } as Record<
    "calories" | "protein" | "weight" | "steps",
    string | null
  >;
  const [body, setBody] = useState(EMPTY_BODY);
  const [bodySaved, setBodySaved] = useState(false);
  // Brief "Saved" tick next to whichever instant-save row was just written.
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function flashSaved(key: string) {
    setSavedFlash(key);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(null), 1600);
  }
  const bodyDirty = Object.values(body).some((v) => v !== null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const logsInRange = useMemo(
    () => logs.filter((l) => !startDate || l.date >= startDate),
    [logs, startDate]
  );

  // Newest first, for the list.
  const recent = useMemo(
    () => [...logsInRange].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
    [logsInRange]
  );
  const visibleLogs = showAllLogs ? recent : recent.slice(0, 3);

  // Newest log that actually carries a mood score — a drinks-only entry has none,
  // so it shouldn't drive the header badge.
  const latest = recent.find((l) => l.mood != null);
  // Only mood-bearing logs belong on the trend chart.
  const moodTrend = useMemo(() => logsInRange.filter((l) => l.mood != null), [logsInRange]);

  function contextSummary(
    f: typeof EMPTY_FORM,
    exercised: boolean,
    dinnerPlan: boolean,
    drinks: { today?: number; dayBefore?: number },
    times?: string[]
  ) {
    const parts: string[] = [];
    const cups = times ? times.length : f.caffeineCups;
    if (cups)
      parts.push(
        `${cups} coffee${cups > 1 ? "s" : ""}${times?.length ? ` (at ${times.join(", ")})` : ""}`
      );
    const plural = (n: number) => `${n} drink${n === 1 ? "" : "s"}`;
    if (drinks.today) parts.push(`${plural(drinks.today)} so far today`);
    if (drinks.dayBefore) parts.push(`${plural(drinks.dayBefore)} the day before`);
    if (exercised) parts.push("exercised");
    if (dinnerPlan) parts.push("followed dinner plan");
    if (f.bedtime && f.wakeTime) {
      const h = sleepHours(f.bedtime, f.wakeTime);
      if (h !== null) parts.push(`slept ${h}h`);
    }
    return parts.join(", ");
  }

  async function fetchQuestion(
    f: typeof EMPTY_FORM,
    date: string,
    exercised: boolean,
    dinnerPlan: boolean,
    times?: string[]
  ) {
    setAiLoading(true);
    setAiQuestion("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const localTime = new Date().toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      // Send recent history so Claude can learn the user's patterns and ask
      // an informed, personalized question (capped to keep the prompt lean).
      const history = [...logs]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 40)
        .map((l) => ({
          at: l.loggedAt,
          mood: l.mood,
          energy: l.energy,
          coffees: l.caffeineCups,
          drinksThatDay: drinksOn[l.date],
          drinksDayBefore: drinksOn[addDays(l.date, -1)],
          exercised: l.exercised,
          dinnerPlan: l.dinnerPlan,
          bedtime: l.bedtime,
          wakeTime: l.wakeTime,
          q: l.aiQuestion || undefined,
          a: l.aiAnswer || undefined,
          note: l.notes || undefined,
        }));
      const res = await fetch("/api/ai/mood-question", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          localTime,
          mood: f.mood,
          energy: f.energy,
          context: contextSummary(
            f,
            exercised,
            dinnerPlan,
            { today: drinksOn[date], dayBefore: drinksOn[addDays(date, -1)] },
            times
          ),
          history,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAiQuestion(data.question ?? "");
    } catch {
      setAiQuestion(""); // AI question is optional — fail quietly
    } finally {
      setAiLoading(false);
    }
  }

  // Newest log for a given day, if any — the one the calendar shows for that day.
  function latestLogFor(date: string): MoodLog | undefined {
    return logs
      .filter((l) => l.date === date)
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];
  }

  // Open the form for `date` (today by default). If that day already has a
  // log, edit it in place; otherwise start a fresh entry for that day.
  // `preferExisting: false` always starts a new entry (the "+ Log" button),
  // so today can still get more than one log.
  function openLog(date: string = today, preferExisting = true) {
    const target = date > today ? today : date;
    const existing = preferExisting ? latestLogFor(target) : undefined;
    if (existing) {
      startEdit(existing);
      return;
    }
    setLogDate(target);
    setBody(EMPTY_BODY);
    setBodySaved(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAiQuestion("");
    setShowForm(true);
    // The smart question is about "right now", so only ask it for today.
    if (target === today) {
      fetchQuestion(
        EMPTY_FORM,
        target,
        workouts.some((w) => w.date === target),
        dinnerPlans.some((d) => d.date === target),
        coffees
          .filter((c) => c.date === target)
          .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
          .map((c) => prettyTime(c.loggedAt))
      );
    }
  }

  // Calendar taps land here: open (or edit) the log for that day and bring
  // the form into view.
  useEffect(() => {
    if (!openRequest) return;
    openLog(openRequest.date);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // Toggle the shared workout for the day being logged (same source the main
  // page / Exercise section use).
  async function toggleWorkoutOnDate() {
    if (!uid) return;
    const existing = workouts.find((w) => w.date === logDate);
    if (existing) await deleteItem(uid, "workouts", existing.id);
    else await addItem(uid, "workouts", { date: logDate, type: "Exercise" });
  }

  // "7+" opens a box asking for the exact count; null = closed.
  const [manyDrinks, setManyDrinks] = useState<string | null>(null);
  useEffect(() => setManyDrinks(null), [logDate, showForm]);
  async function commitManyDrinks() {
    const n = Math.round(Number(manyDrinks));
    if (!(n >= 7 && n <= 40)) return;
    setManyDrinks(null);
    if (drinksOnDate !== n) await setDrinksOnDate(n);
  }

  // Drinks for the day being logged, written on tap. Tapping the current value
  // again clears the day back to "not logged".
  async function setDrinksOnDate(n: number) {
    if (!uid) return;
    const id = drinkLogId(logDate);
    const existing = drinkLogs.find((d) => d.id === id);
    if (existing && existing.drinks === n) {
      await deleteItem(uid, DRINK_LOGS, id);
    } else {
      const now = new Date().toISOString();
      await setItem(uid, DRINK_LOGS, id, {
        date: logDate,
        drinks: n,
        updatedAt: now,
        createdAt: existing?.createdAt ?? now,
      });
    }
    flashSaved("drinks");
  }

  function startEdit(l: MoodLog) {
    setLogDate(l.date);
    setBody(EMPTY_BODY);
    setBodySaved(false);
    setForm({
      mood: l.mood ?? null,
      energy: l.energy ?? null,
      caffeineCups: l.caffeineCups ?? 0,
      bedtime: l.bedtime ?? "",
      wakeTime: l.wakeTime ?? "",
      aiAnswer: l.aiAnswer ?? "",
      notes: l.notes ?? "",
    });
    setAiQuestion(l.aiQuestion ?? "");
    setEditingId(l.id);
    setShowForm(true);
  }

  function closeForm() {
    setBody(EMPTY_BODY);
    setBodySaved(false);
    setForm(EMPTY_FORM);
    setAiQuestion("");
    setEditingId(null);
    setLogDate(today);
    setShowForm(false);
  }

  const num = (v: string | null) => {
    if (v === null || v.trim() === "") return null;
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Write only the food & body fields that were edited. Calories/protein
  // replace the day's entries with a single day total, so re-saving never
  // double counts; weight and steps are one doc per day.
  async function saveBody() {
    if (!uid || !bodyDirty) return;
    const now = new Date().toISOString();
    const cal = num(body.calories);
    const pro = num(body.protein);
    if (body.calories !== null || body.protein !== null) {
      const calories = Math.round(cal ?? (body.calories === null ? dayCalories : 0));
      const proteinG = pro !== null ? Math.round(pro) : body.protein === null && dayProtein > 0 ? dayProtein : undefined;
      for (const f of dayFoods) await deleteItem(uid, "foodEntries", f.id);
      if (calories > 0 || proteinG !== undefined) {
        await addItem(uid, "foodEntries", { date: logDate, calories, proteinG, label: "Day total" });
      }
    }
    const w = num(body.weight);
    if (w !== null && w > 0) {
      if (dayWeight) await updateItem(uid, "weightLogs", dayWeight.id, { weightLbs: w });
      else await addItem(uid, "weightLogs", { date: logDate, weightLbs: w });
    }
    const st = num(body.steps);
    if (st !== null && st <= MAX_STEPS_PER_DAY) {
      await setItem(uid, STEP_LOGS, stepLogId(logDate), {
        date: logDate,
        steps: Math.round(st),
        source: "manual",
        updatedAt: now,
        ...(daySteps ? {} : { createdAt: now }),
      });
    }
    setBody(EMPTY_BODY);
    setBodySaved(true);
    flashSaved("body");
  }

  // A check-in needs a mood. Drinks, exercise, dinner plan and food & body
  // all save on their own, so they never create a mood entry.
  const canSave = form.mood != null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !canSave) return;
    await saveBody();
    const editable = {
      mood: form.mood ?? undefined,
      energy: form.energy ?? undefined,
      // Snapshot the day's coffees as of now (old logs without coffee taps
      // keep the count they were saved with).
      caffeineCups: dateCoffees.length || form.caffeineCups,
      // Snapshot the day's shared exercise / dinner-plan status.
      exercised: exercisedOnDate,
      dinnerPlan: dinnerPlanOnDate,
      bedtime: form.bedtime,
      wakeTime: form.wakeTime,
      aiQuestion,
      aiAnswer: form.aiAnswer.trim(),
      notes: form.notes.trim(),
    };
    if (editingId) {
      await updateItem(uid, "moodLogs", editingId, editable);
    } else {
      // Backfilled days get a midday timestamp so they sort sensibly among
      // that day's entries; today's logs keep the exact moment.
      await addItem(uid, "moodLogs", {
        ...editable,
        date: logDate,
        loggedAt: isToday
          ? new Date().toISOString()
          : new Date(logDate + "T12:00:00").toISOString(),
      });
    }
    closeForm();
  }

  async function refreshInsights() {
    if (!uid) return;
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      // Send the most recent logs (capped) so the prompt stays lean.
      const payload = [...logs]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 90);
      // Individual coffee timestamps so Claude can correlate timing, not just counts.
      const coffeePayload = [...coffees]
        .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
        .slice(0, 200)
        .map((c) => c.loggedAt);
      const res = await fetch("/api/ai/mood-insights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ logs: payload, coffeeTimes: coffeePayload, drinks: drinksOn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await setItem(uid, "moodInsights", "latest", {
        summary: data.summary ?? "",
        patterns: data.patterns ?? [],
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : "Could not generate insights");
    } finally {
      setInsightsLoading(false);
    }
  }

  const formSleep =
    form.bedtime && form.wakeTime ? sleepHours(form.bedtime, form.wakeTime) : null;

  return (
    <section ref={sectionRef} className="card scroll-mt-4 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title">Mood</h2>
        <div className="flex items-center gap-2">
          {latest && !showForm && (
            <span className="hidden gap-1.5 text-[11px] font-semibold lg:flex">
              <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-indigo">
                {latest.mood}
              </span>
              {latest.energy != null && (
                <span className="rounded-full bg-amber/10 px-2 py-0.5 text-amber">
                  ⚡{latest.energy}
                </span>
              )}
            </span>
          )}
          <button
            onClick={() => (showForm ? closeForm() : openLog(today, false))}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {showForm ? "Close" : "+ Log"}
          </button>
          <button
            onClick={() => setDetailsOpen((o) => !o)}
            className="text-muted transition hover:text-ink"
            title={detailsOpen ? "Hide insights & logs" : "Show insights & logs"}
          >
            <Chevron open={detailsOpen} />
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-4 space-y-3">
          {/* Day picker: step through days, or tap the date to jump. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openLog(addDays(logDate, -1))}
                className="grid h-8 w-8 place-items-center rounded-full text-lg text-muted transition hover:bg-line/60 hover:text-ink"
                title="Previous day"
              >
                ‹
              </button>
              <label className="relative cursor-pointer rounded-lg px-1.5 py-0.5 transition hover:bg-line/60">
                <span className="block text-base font-bold leading-tight">
                  {isToday ? "Today" : logDate === addDays(today, -1) ? "Yesterday" : prettyDate(logDate)}
                </span>
                <span className="block text-[11px] leading-tight text-muted">
                  {isToday || logDate === addDays(today, -1) ? prettyDate(logDate) : "Tap to pick a day"}
                </span>
                <input
                  type="date"
                  aria-label="Pick a day"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={logDate}
                  max={today}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => e.target.value && openLog(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => openLog(addDays(logDate, 1))}
                disabled={isToday}
                className="grid h-8 w-8 place-items-center rounded-full text-lg text-muted transition hover:bg-line/60 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                title="Next day"
              >
                ›
              </button>
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => openLog(today)}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition hover:text-ink"
              >
                Jump to today
              </button>
            )}
          </div>

          {/* ---- The day: everything here saves the moment you change it ---- */}
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-bold">Habits &amp; body</h3>
              <span className="text-[11px] text-muted">Saves as you go</span>
            </div>

            <div className="space-y-4">
              <Row
                icon="🍷"
                label="Drinks"
                hint={
                  drinksOnDate === undefined
                    ? "Not logged"
                    : `${drinksOnDate} ${isToday ? "today" : "that day"}`
                }
                saved={savedFlash === "drinks"}
              >
                <div className="grid grid-cols-8 gap-1 sm:flex sm:gap-1.5">
                  {DRINK_OPTS.map((n) => (
                    <DrinkChip
                      key={n}
                      on={drinksOnDate === n}
                      onClick={() => {
                        setManyDrinks(null);
                        setDrinksOnDate(n);
                      }}
                    >
                      {n}
                    </DrinkChip>
                  ))}
                  {/* More than 6: ask for the exact number. */}
                  <DrinkChip
                    on={drinksOnDate !== undefined && drinksOnDate > 6}
                    onClick={() =>
                      setManyDrinks(
                        manyDrinks !== null
                          ? null
                          : drinksOnDate !== undefined && drinksOnDate > 6
                            ? String(drinksOnDate)
                            : ""
                      )
                    }
                  >
                    {drinksOnDate !== undefined && drinksOnDate > 6 ? drinksOnDate : "7+"}
                  </DrinkChip>
                </div>
                {manyDrinks !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-muted">How many exactly?</span>
                    <input
                      autoFocus
                      type="number"
                      inputMode="numeric"
                      min={7}
                      max={40}
                      className="input w-20 py-1.5 text-center"
                      value={manyDrinks}
                      onChange={(e) => setManyDrinks(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitManyDrinks();
                        }
                        if (e.key === "Escape") setManyDrinks(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={commitManyDrinks}
                      disabled={!(Number(manyDrinks) >= 7)}
                      className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                )}
              </Row>

              <Toggle on={exercisedOnDate} onClick={toggleWorkoutOnDate}>
                🏃 {isToday ? "Exercised today" : "Exercised"}
              </Toggle>

              <Row icon="🍽️" label="Food & body" saved={savedFlash === "body"}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <BodyField
                    label="Calories"
                    value={body.calories ?? (dayCalories ? String(dayCalories) : "")}
                    onChange={(v) => setBody({ ...body, calories: v })}
                    onCommit={saveBody}
                  />
                  <BodyField
                    label="Protein"
                    unit="g"
                    value={body.protein ?? (dayProtein ? String(dayProtein) : "")}
                    onChange={(v) => setBody({ ...body, protein: v })}
                    onCommit={saveBody}
                  />
                  <BodyField
                    label="Weight"
                    unit="lb"
                    value={body.weight ?? (dayWeight ? String(dayWeight.weightLbs) : "")}
                    onChange={(v) => setBody({ ...body, weight: v })}
                    onCommit={saveBody}
                  />
                  <BodyField
                    label="Steps"
                    value={body.steps ?? (daySteps ? String(daySteps.steps) : "")}
                    onChange={(v) => setBody({ ...body, steps: v })}
                    onCommit={saveBody}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  Day totals. Calories or protein here replace that day&apos;s food entries.
                </p>
              </Row>
            </div>
          </div>

          {/* ---- Check-in: only saved when you tap the button ---- */}
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-bold">
                {isToday ? "How are you feeling?" : "How were you feeling?"}
              </h3>
              {editingId && (
                <span className="text-[11px] text-muted">
                  Editing {prettyTime(logs.find((l) => l.id === editingId)?.loggedAt ?? "")} check-in
                </span>
              )}
            </div>

            <div className="space-y-4">
              <Scale
                label="Mood"
                value={form.mood}
                tone="indigo"
                onChange={(v) => setForm({ ...form, mood: v })}
              />
              <Scale
                label="Energy"
                value={form.energy}
                tone="amber"
                onChange={(v) => setForm({ ...form, energy: v })}
              />

              <Row
                icon="🛏"
                label={isToday ? "Sleep last night" : "Sleep the night before"}
                hint={formSleep !== null ? `${formSleep}h` : undefined}
              >
                <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                  <label className="text-[11px] font-semibold text-muted">
                    Bed
                    <input
                      type="time"
                      className="input mt-1 py-1.5"
                      value={form.bedtime}
                      onChange={(e) => setForm({ ...form, bedtime: e.target.value })}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-muted">
                    Up
                    <input
                      type="time"
                      className="input mt-1 py-1.5"
                      value={form.wakeTime}
                      onChange={(e) => setForm({ ...form, wakeTime: e.target.value })}
                    />
                  </label>
                </div>
              </Row>

              {/* AI follow-up — the question is about "right now", so skip it when
                  backfilling a past day (existing logs keep whatever they were asked). */}
              {(isToday || !!editingId) && (aiLoading || aiQuestion) && (
                <div className="rounded-lg bg-indigo/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">
                      <span className="mr-1 text-indigo">✦</span>
                      {aiLoading ? <span className="text-muted">Thinking of a question…</span> : aiQuestion}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        fetchQuestion(form, logDate, exercisedOnDate, dinnerPlanOnDate, coffeeTimes)
                      }
                      className="shrink-0 text-xs text-muted hover:text-ink"
                      disabled={aiLoading}
                      title="Ask a different question"
                    >
                      ↻
                    </button>
                  </div>
                  <input
                    className="input mt-2 bg-card"
                    placeholder="Your answer (optional)"
                    value={form.aiAnswer}
                    onChange={(e) => setForm({ ...form, aiAnswer: e.target.value })}
                  />
                </div>
              )}

              <textarea
                className="input min-h-[2.75rem] resize-y"
                rows={1}
                placeholder="Anything else? (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />

              <div>
                <button
                  type="submit"
                  disabled={!canSave}
                  className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {editingId ? "Save changes" : "Save check-in"}
                </button>
                {!canSave && (
                  <p className="mt-1.5 text-center text-[11px] text-muted">
                    Pick a mood to save a check-in. Drinks and the rest above are already saved.
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>
      )}

      <MoodChart logs={moodTrend} compact={!detailsOpen} />

      {detailsOpen && (
      <>
      {/* AI insights */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">✦ Insights</h3>
          <button
            onClick={refreshInsights}
            disabled={insightsLoading || logs.length < 3}
            className="btn-ghost px-3 py-1 text-xs disabled:opacity-50"
          >
            {insightsLoading ? "Analyzing…" : "Refresh"}
          </button>
        </div>
        {insightsError && <p className="text-sm text-coral">{insightsError}</p>}
        {!insights && !insightsError && (
          <p className="text-sm text-muted">
            {logs.length < 3
              ? "Log a few times, then generate insights."
              : "Tap “Refresh” to find your patterns."}
          </p>
        )}
        {insights && (
          <div className="space-y-2">
            <p className="text-sm">{insights.summary}</p>
            {insights.patterns?.length > 0 && (
              <ul className="space-y-1">
                {insights.patterns.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-indigo">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">
              Updated {prettyDate(insights.generatedAt.slice(0, 10))},{" "}
              {prettyTime(insights.generatedAt)}
            </p>
          </div>
        )}
      </div>

      {/* Log history */}
      <div className="mt-4 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-bold">Recent logs</h3>
        {recent.length === 0 && (
          <p className="text-sm text-muted">No logs in this range yet.</p>
        )}
        <div className="space-y-2">
          {visibleLogs.map((l) => {
            const slept = l.bedtime && l.wakeTime ? sleepHours(l.bedtime, l.wakeTime) : null;
            return (
              <article key={l.id} className="group rounded-lg border border-line bg-bg/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {prettyDate(l.date)} · {prettyTime(l.loggedAt)}
                  </span>
                  <span className="flex gap-2 text-xs font-semibold">
                    {l.mood != null && (
                      <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-indigo">
                        Mood {l.mood}
                      </span>
                    )}
                    {l.energy != null && (
                      <span className="rounded-full bg-amber/10 px-2 py-0.5 text-amber">
                        Energy {l.energy}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {!!l.caffeineCups && <span>☕ {l.caffeineCups}</span>}
                  {!!drinksOn[l.date] && <span>🍷 {drinksOn[l.date]}</span>}
                  {l.exercised && <span>🏃 exercised</span>}
                  {l.dinnerPlan && <span>🫐🥭 dinner plan</span>}
                  {slept !== null && <span>🛏 {slept}h</span>}
                </div>
                {l.aiQuestion && (
                  <p className="mt-1.5 text-sm">
                    <span className="text-muted">{l.aiQuestion}</span>
                    {l.aiAnswer && <> — {l.aiAnswer}</>}
                  </p>
                )}
                {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
                <div className="mt-2 flex gap-3 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(l)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => uid && deleteItem(uid, "moodLogs", l.id)}
                    className="text-xs text-muted hover:text-coral"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {recent.length > 3 && (
          <button
            onClick={() => setShowAllLogs((s) => !s)}
            className="mt-2 w-full text-center text-xs font-semibold text-indigo"
          >
            {showAllLogs ? "Show less" : `Show all ${recent.length}`}
          </button>
        )}
      </div>
      </>
      )}
    </section>
  );
}

function Row({
  icon,
  label,
  hint,
  saved,
  children,
}: {
  icon: string;
  label: string;
  hint?: string;
  saved?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-muted">
          <span className="mr-1">{icon}</span>
          {label}
        </span>
        <span className="text-[11px] font-medium">
          {saved ? (
            <span className="text-teal">Saved ✓</span>
          ) : (
            hint && <span className="text-muted">{hint}</span>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition active:scale-95 ${
        on
          ? "border-teal/40 bg-teal/10 text-teal"
          : "border-line bg-bg text-muted hover:text-ink"
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] leading-none ${
          on ? "border-teal bg-teal text-white" : "border-muted/40"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}

function BodyField({
  label,
  unit,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="text-[11px] font-semibold text-muted">
      {label}
      <span className="relative mt-1 block">
        <input
          type="text"
          inputMode="decimal"
          className={`input py-1.5 ${unit ? "pr-7" : ""}`}
          placeholder="—"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs font-normal text-muted">
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const SCALE_TONES = {
  indigo: { on: "border-indigo bg-indigo text-white", text: "text-indigo", hover: "hover:border-indigo/50" },
  amber: { on: "border-amber bg-amber text-white", text: "text-amber", hover: "hover:border-amber/50" },
};

// 1–10 tap scale with no default: shows "—" until you pick, and tapping the
// picked number again clears it.
function Scale({
  label,
  value,
  tone,
  onChange,
}: {
  label: string;
  value: number | null;
  tone: keyof typeof SCALE_TONES;
  onChange: (v: number | null) => void;
}) {
  const t = SCALE_TONES[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`text-sm font-bold ${value == null ? "text-muted/60" : t.text}`}>
          {value == null ? "—" : `${value}/10`}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(on ? null : n)}
              aria-pressed={on}
              className={`h-9 rounded-lg border text-sm font-semibold transition active:scale-95 ${
                on ? `${t.on} shadow-card` : `border-line bg-bg text-ink ${t.hover}`
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

// 0–6 as one-tap chips; more than that goes through "7+" and an exact count.
const DRINK_OPTS = [0, 1, 2, 3, 4, 5, 6];

function DrinkChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-9 rounded-full border text-sm font-semibold transition active:scale-95 sm:min-w-[2.75rem] sm:px-3 ${
        on
          ? "border-coral bg-coral text-white shadow-card"
          : "border-line bg-bg text-ink hover:border-coral/50"
      }`}
    >
      {children}
    </button>
  );
};
