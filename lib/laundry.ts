// Shared laundry-status logic for 3720centerstreet.com. Pure functions only —
// both API routes and the server-rendered page use these so "in use" is
// derived the same way everywhere. All timestamps are epoch milliseconds.

export type MachineId = "washer" | "dryer";
export const MACHINES: readonly MachineId[] = ["washer", "dryer"] as const;

export function isMachineId(v: unknown): v is MachineId {
  return v === "washer" || v === "dryer";
}

/** Raw per-machine state stored in Firestore at laundry/status. */
export interface MachineState {
  /** Last value the plug reported (watts above its threshold, debounced). */
  running: boolean;
  watts: number | null;
  lastReportAt: number | null;
  /** Last moment we know the machine was running. */
  lastRunningAt: number | null;
  /** When the current (or most recent) run started. */
  runStartedAt: number | null;
  /** End of the last run that lasted at least minRunMs. */
  lastRunEndedAt: number | null;
  /** When the "done" text for the current run was claimed/sent. */
  doneNotifiedAt: number | null;
  /** Relay state from the last report (false = the machine has no power). */
  powered: boolean | null;
}

export interface LaundryDoc {
  washer: MachineState;
  dryer: MachineState;
}

/** Tunables, stored at laundry/config so they can change without a deploy. */
export interface LaundryConfig {
  /** Keep showing "in use" this long after the last running report. */
  graceMs: number;
  /** A plug that hasn't reported in this long is shown as offline. */
  offlineMs: number;
  /** Runs shorter than this never trigger a "done" text. */
  minRunMs: number;
}

export const DEFAULT_CONFIG: LaundryConfig = {
  graceMs: 2 * 60_000,
  offlineMs: 12 * 60_000,
  minRunMs: 5 * 60_000,
};

export const EMPTY_MACHINE: MachineState = {
  running: false,
  watts: null,
  lastReportAt: null,
  lastRunningAt: null,
  runStartedAt: null,
  lastRunEndedAt: null,
  doneNotifiedAt: null,
  powered: null,
};

export function emptyDoc(): LaundryDoc {
  return { washer: { ...EMPTY_MACHINE }, dryer: { ...EMPTY_MACHINE } };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Coerce whatever is in Firestore into a well-formed doc. */
export function normalizeDoc(raw: unknown): LaundryDoc {
  const doc = emptyDoc();
  if (!raw || typeof raw !== "object") return doc;
  for (const id of MACHINES) {
    const m = (raw as Record<string, unknown>)[id];
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    doc[id] = {
      running: r.running === true,
      watts: num(r.watts),
      lastReportAt: num(r.lastReportAt),
      lastRunningAt: num(r.lastRunningAt),
      runStartedAt: num(r.runStartedAt),
      lastRunEndedAt: num(r.lastRunEndedAt),
      doneNotifiedAt: num(r.doneNotifiedAt),
      powered: typeof r.powered === "boolean" ? r.powered : null,
    };
  }
  return doc;
}

export function normalizeConfig(raw: unknown): LaundryConfig {
  const cfg = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== "object") return cfg;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(cfg) as (keyof LaundryConfig)[]) {
    const v = num(r[key]);
    if (v !== null && v >= 0) cfg[key] = v;
  }
  return cfg;
}

/** What the page shows for one machine. */
export interface MachineStatus {
  inUse: boolean;
  /** Start of the current run, when in use. */
  since: number | null;
  lastActivityAt: number | null;
  /** End of the last real run, when free. */
  finishedAt: number | null;
  online: boolean;
  watts: number | null;
  /** false when the plug's relay is off (machine has no power). */
  powered: boolean | null;
}

export interface LaundryStatus {
  washer: MachineStatus;
  dryer: MachineStatus;
  updatedAt: number;
}

export function deriveMachine(m: MachineState, config: LaundryConfig, now: number): MachineStatus {
  const recentlyRunning = m.lastRunningAt !== null && now - m.lastRunningAt < config.graceMs;
  const inUse = m.running || recentlyRunning;
  const online = m.lastReportAt !== null && now - m.lastReportAt < config.offlineMs;

  let finishedAt: number | null = null;
  if (!inUse) {
    const ranLongEnough =
      m.runStartedAt !== null &&
      m.lastRunningAt !== null &&
      m.lastRunningAt - m.runStartedAt >= config.minRunMs;
    if (m.lastRunEndedAt !== null && (m.lastRunningAt === null || m.lastRunEndedAt >= m.lastRunningAt)) {
      finishedAt = m.lastRunEndedAt;
    } else if (ranLongEnough) {
      // Run expired but the post-stop report hasn't landed yet.
      finishedAt = m.lastRunningAt;
    } else {
      finishedAt = m.lastRunEndedAt;
    }
  }

  return {
    inUse,
    since: inUse ? m.runStartedAt : null,
    lastActivityAt: m.lastRunningAt,
    finishedAt,
    online,
    watts: online ? m.watts : null,
    powered: online ? m.powered : null,
  };
}

export function deriveStatus(doc: LaundryDoc, config: LaundryConfig, now: number): LaundryStatus {
  return {
    washer: deriveMachine(doc.washer, config, now),
    dryer: deriveMachine(doc.dryer, config, now),
    updatedAt: now,
  };
}

export interface PlugReport {
  machine: MachineId;
  running: boolean;
  watts: number;
  /** Relay state; omitted by older scripts. */
  output?: boolean;
  /** Shelly's reason for the last relay change (button, HTTP_in, init, overpower, ...). */
  source?: string;
  /** The plug's watchdog just turned the relay back on. */
  restored?: boolean;
}

export interface ApplyResult {
  next: MachineState;
  /** running flag changed vs. the previous report (worth logging). */
  flipped: boolean;
  /** A real run just ended and the "done" notification is claimed. */
  finished: boolean;
}

/**
 * Fold one plug report into the stored state. Server time is authoritative.
 * A `running: false` report right after `running: true` means the machine ran
 * until now (the plug only reports off after its own debounce).
 */
export function applyReport(
  prev: MachineState,
  report: PlugReport,
  config: LaundryConfig,
  now: number
): ApplyResult {
  const wasInUse = deriveMachine(prev, config, now).inUse;
  const next: MachineState = {
    ...prev,
    running: report.running,
    watts: report.watts,
    lastReportAt: now,
    powered: typeof report.output === "boolean" ? report.output : prev.powered,
  };
  const flipped = prev.running !== report.running;
  let finished = false;

  if (report.running) {
    if (!wasInUse || next.runStartedAt === null) next.runStartedAt = now;
    next.lastRunningAt = now;
  } else {
    if (prev.running) next.lastRunningAt = now;
    const idlePastGrace = next.lastRunningAt !== null && now - next.lastRunningAt >= config.graceMs;
    const ranLongEnough =
      next.runStartedAt !== null &&
      next.lastRunningAt !== null &&
      next.lastRunningAt - next.runStartedAt >= config.minRunMs;
    const notNotified =
      next.doneNotifiedAt === null || (next.runStartedAt !== null && next.doneNotifiedAt < next.runStartedAt);
    if (idlePastGrace && ranLongEnough && notNotified) {
      finished = true;
      next.lastRunEndedAt = next.lastRunningAt;
      next.doneNotifiedAt = now;
    }
  }

  return { next, flipped, finished };
}

export function machineLabel(id: MachineId): string {
  return id === "washer" ? "Washer" : "Dryer";
}
