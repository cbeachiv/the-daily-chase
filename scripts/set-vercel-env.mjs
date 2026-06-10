// Pushes all required environment variables to the linked Vercel project
// (production target). Run with: node --env-file=.env.local scripts/set-vercel-env.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const sa = JSON.parse(readFileSync("serviceAccount.json", "utf8"));

const vars = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RECAP_EMAIL: process.env.RECAP_EMAIL,
  RESEND_FROM: process.env.RESEND_FROM,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GATE_PASSWORD: process.env.GATE_PASSWORD,
  FIREBASE_PROJECT_ID: sa.project_id,
  FIREBASE_CLIENT_EMAIL: sa.client_email,
  // Store newlines escaped; the app converts \n back to real newlines.
  FIREBASE_PRIVATE_KEY: sa.private_key.replace(/\n/g, "\\n"),
  CRON_SECRET: randomBytes(32).toString("hex"),
};

const vercel = ["--yes", "vercel@latest"];

for (const [name, value] of Object.entries(vars)) {
  if (value === undefined || value === "") {
    console.warn(`! skipping ${name} (no value)`);
    continue;
  }
  // Remove any existing value first so this is safe to re-run.
  try {
    execFileSync("npx", [...vercel, "env", "rm", name, "production", "--yes"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    /* not set yet — fine */
  }
  execFileSync("npx", [...vercel, "env", "add", name, "production"], {
    input: value,
    stdio: ["pipe", "ignore", "inherit"],
  });
  console.log(`✓ ${name}`);
}

console.log("\nDone. CRON_SECRET was generated fresh for production.");
if (!existsSync(".vercel/project.json")) console.warn("Warning: project not linked?");
