import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Server-only Firebase Admin SDK (cron route, token verification, seed script).
let app: App | undefined;

function loadCredential(): ServiceAccount {
  // Production (Vercel): credentials come from env vars.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  // Local dev: read the gitignored service-account key file directly.
  const file = join(process.cwd(), "serviceAccount.json");
  if (existsSync(file)) {
    const json = JSON.parse(readFileSync(file, "utf8"));
    return { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
  }

  throw new Error(
    "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / " +
      "FIREBASE_PRIVATE_KEY, or place serviceAccount.json in the project root."
  );
}

function adminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp({ credential: cert(loadCredential()) });
  return app;
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}
