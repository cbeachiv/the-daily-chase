import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { fmtPace } from "@/lib/cardio";

// Strava → Exercise sync. Every run on Strava marks that day as exercised
// (users/{uid}/workouts), the same doc the Exercise quick-log tile writes, and
// lands in the Cardio log (users/{uid}/cardio) with distance, pace, elevation
// and heart rate. Cardio docs are keyed strava-<activityId>, so re-syncs are
// idempotent; a hand-logged outdoor run on the same day gets the Strava stats
// merged into it instead of a duplicate row.
//
// OAuth tokens live in the top-level, client-denied `stravaAuth/{uid}` doc.
// Strava access tokens expire every 6h; refresh tokens can rotate, so the
// latest pair returned by Strava is always written back.

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

// Strava sport types that count as a run.
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

// How far back each sync looks. Covers a few days without opening the site.
const LOOKBACK_DAYS = 14;

interface StravaAuth {
  athleteId?: number;
  athleteName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch seconds
  pendingState?: string;
  lastSyncAt?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date_local: string; // "2026-09-23T06:12:00Z" (local wall time, despite the Z)
  moving_time: number; // seconds
  distance: number; // meters
  total_elevation_gain?: number; // meters
  average_heartrate?: number;
  max_heartrate?: number;
  trainer?: boolean; // treadmill
}

const authDoc = (uid: string) => adminDb().doc(`stravaAuth/${uid}`);

function credentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET");
  return { clientId, clientSecret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function tokenFields(t: TokenResponse) {
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at };
}

/** Start OAuth: remember a one-time state for this user and return Strava's authorize URL. */
export async function stravaAuthorizeUrl(uid: string, origin: string): Promise<string> {
  const { clientId } = credentials();
  const state = randomBytes(16).toString("hex");
  await authDoc(uid).set({ pendingState: state }, { merge: true });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

/** Finish OAuth: match the state back to a user, exchange the code, store tokens. Returns the uid. */
export async function completeStravaAuth(code: string, state: string): Promise<string> {
  const snap = await adminDb().collection("stravaAuth").where("pendingState", "==", state).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) throw new Error("Unknown or expired Strava state");
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  await doc.ref.set({
    ...tokenFields(t),
    athleteId: t.athlete?.id ?? null,
    athleteName: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(" ") || null,
    pendingState: null,
  }, { merge: true });
  return doc.id;
}

async function accessToken(uid: string, auth: StravaAuth): Promise<string> {
  if (auth.accessToken && (auth.expiresAt ?? 0) > Date.now() / 1000 + 120) return auth.accessToken;
  const t = await tokenRequest({ refresh_token: auth.refreshToken!, grant_type: "refresh_token" });
  await authDoc(uid).set(tokenFields(t), { merge: true });
  return t.access_token;
}

/** Cardio-log fields for one Strava run. */
function cardioFields(run: StravaActivity) {
  const miles = run.distance / 1609.344;
  const durationMin = Math.round((run.moving_time / 60) * 100) / 100;
  const local = run.start_date_local; // wall-clock time, despite the Z
  const fields: Record<string, unknown> = {
    date: local.slice(0, 10),
    dateTime: `${local.slice(0, 10)} ${local.slice(11, 19)}`,
    kind: run.trainer ? "treadmill" : "outdoor",
    durationMin,
    distanceMi: Math.round(miles * 100) / 100,
    stravaId: run.id,
    title: run.name,
  };
  if (miles > 0) {
    if (run.trainer) fields.speedMph = Math.round((miles / (durationMin / 60)) * 10) / 10;
    else fields.pace = fmtPace(durationMin / miles);
  }
  if (run.total_elevation_gain) fields.elevationFt = Math.round(run.total_elevation_gain * 3.28084);
  if (run.average_heartrate) fields.avgHr = Math.round(run.average_heartrate);
  if (run.max_heartrate) fields.maxHr = Math.round(run.max_heartrate);
  return fields;
}

async function fetchRuns(token: string, after: number): Promise<StravaActivity[]> {
  const runs: StravaActivity[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${API}/athlete/activities?after=${after}&per_page=200&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Strava activities failed: ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as StravaActivity[];
    runs.push(...batch.filter((a) => RUN_TYPES.has(a.sport_type ?? a.type)));
    if (batch.length < 200) return runs;
  }
}

/**
 * Pull Strava runs (the last LOOKBACK_DAYS by default, or everything since
 * `sinceEpoch`), mark each run's day as exercised, and upsert its Cardio entry.
 * Returns connected=false if Strava isn't linked.
 */
export async function syncStrava(
  uid: string,
  { sinceEpoch }: { sinceEpoch?: number } = {}
): Promise<{ connected: boolean; added: string[]; runs: number }> {
  const auth = ((await authDoc(uid).get()).data() ?? {}) as StravaAuth;
  if (!auth.refreshToken) return { connected: false, added: [], runs: 0 };

  const token = await accessToken(uid, auth);
  const after = sinceEpoch ?? Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const runs = await fetchRuns(token, after);

  const db = adminDb();
  const workouts = db.collection(`users/${uid}/workouts`);
  const cardio = db.collection(`users/${uid}/cardio`);
  const oldest = runs.reduce((m, r) => (r.start_date_local < m ? r.start_date_local : m), "9999").slice(0, 10);
  const [workoutSnap, cardioSnap] = runs.length
    ? await Promise.all([
        workouts.where("date", ">=", oldest).get(),
        cardio.where("date", ">=", oldest).get(),
      ])
    : [null, null];
  const markedDays = new Set(workoutSnap?.docs.map((d) => d.data().date as string) ?? []);
  const cardioIds = new Set(cardioSnap?.docs.map((d) => d.id) ?? []);
  // Hand-logged outdoor runs without Strava data, by day, to enrich instead of duplicating.
  const manualRuns = new Map<string, string>();
  for (const d of cardioSnap?.docs ?? []) {
    const c = d.data();
    if (c.kind === "outdoor" && !c.stravaId && !manualRuns.has(c.date)) manualRuns.set(c.date, d.id);
  }

  const added: string[] = [];
  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops) await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const run of runs) {
    const fields = cardioFields(run);
    const date = fields.date as string;

    const manualId = manualRuns.get(date);
    if (manualId) {
      batch.set(cardio.doc(manualId), fields, { merge: true });
      manualRuns.delete(date);
    } else {
      const id = `strava-${run.id}`;
      const createdAt = cardioIds.has(id) ? {} : { createdAt: new Date().toISOString() };
      batch.set(cardio.doc(id), { ...fields, ...createdAt }, { merge: true });
    }
    ops++;

    if (!markedDays.has(date)) {
      batch.set(workouts.doc(), {
        date,
        type: "Run",
        durationMin: Math.max(1, Math.round(run.moving_time / 60)),
        notes: `${(fields.distanceMi as number).toFixed(2)} mi on Strava: ${run.name}`,
        stravaId: run.id,
        createdAt: new Date().toISOString(),
      });
      ops++;
      markedDays.add(date);
      added.push(date);
    }
    if (ops >= 400) await flush();
  }
  await flush();

  await authDoc(uid).set({ lastSyncAt: new Date().toISOString() }, { merge: true });
  return { connected: true, added, runs: runs.length };
}
