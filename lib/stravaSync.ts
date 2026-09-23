import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";

// Strava → Exercise sync. Every run on Strava marks that day as exercised
// (users/{uid}/workouts), the same doc the Exercise quick-log tile writes.
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

/**
 * Pull recent Strava runs and mark each run's day as exercised, unless the day
 * already has an Exercise entry. Returns connected=false if Strava isn't linked.
 */
export async function syncStrava(uid: string): Promise<{ connected: boolean; added: string[] }> {
  const auth = ((await authDoc(uid).get()).data() ?? {}) as StravaAuth;
  if (!auth.refreshToken) return { connected: false, added: [] };

  const token = await accessToken(uid, auth);
  const after = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const res = await fetch(`${API}/athlete/activities?after=${after}&per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava activities failed: ${res.status} ${await res.text()}`);
  const runs = ((await res.json()) as StravaActivity[]).filter((a) =>
    RUN_TYPES.has(a.sport_type ?? a.type)
  );

  const workouts = adminDb().collection(`users/${uid}/workouts`);
  const oldest = runs.reduce((m, r) => (r.start_date_local < m ? r.start_date_local : m), "9999");
  const existing = runs.length
    ? (await workouts.where("date", ">=", oldest.slice(0, 10)).get()).docs.map((d) => d.data())
    : [];
  const markedDays = new Set(existing.map((w) => w.date as string));

  const added: string[] = [];
  for (const run of runs) {
    const date = run.start_date_local.slice(0, 10);
    if (markedDays.has(date)) continue;
    const miles = run.distance / 1609.344;
    await workouts.add({
      date,
      type: "Run",
      durationMin: Math.max(1, Math.round(run.moving_time / 60)),
      notes: `${miles.toFixed(2)} mi on Strava: ${run.name}`,
      stravaId: run.id,
      createdAt: new Date().toISOString(),
    });
    markedDays.add(date);
    added.push(date);
  }

  await authDoc(uid).set({ lastSyncAt: new Date().toISOString() }, { merge: true });
  return { connected: true, added };
}
