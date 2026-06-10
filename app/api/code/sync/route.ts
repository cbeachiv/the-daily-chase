import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyUser } from "@/lib/verifyUser";
import {
  colorFor,
  displayName,
  listRepos,
  weeklyAdditions,
  WEEKS_WINDOW,
  type GhRepo,
} from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 300;

// Run async tasks with limited concurrency.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function POST(req: Request) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured. Add GITHUB_TOKEN." },
      { status: 400 }
    );
  }

  let repos: GhRepo[];
  try {
    repos = await listRepos(token);
  } catch (err) {
    console.error("Repo list failed:", err);
    return NextResponse.json({ error: "Could not list repos. Check the token." }, { status: 502 });
  }

  const sinceISO = new Date(Date.now() - WEEKS_WINDOW * 7 * 86_400_000).toISOString();

  // For each repo, sum per-commit additions per week (trailing window).
  const results = await pool(repos, 5, async (r) => {
    const [owner, name] = r.full_name.split("/");
    const weeks = await weeklyAdditions(owner, name, sinceISO, token);
    const total = weeks.reduce((s, w) => s + w.lines, 0);
    return { repo: r, weeks, total };
  });

  const active = results.filter((x) => x.total > 0);
  const weekKeys = new Set<string>();

  const db = adminDb();

  // Replace codeActivity + repos collections for this user.
  await clearCollection(db, `users/${uid}/codeActivity`);
  await clearCollection(db, `users/${uid}/repos`);

  let writes: FirebaseFirestore.WriteBatch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await writes.commit();
      writes = db.batch();
      ops = 0;
    }
  };

  for (const { repo, weeks, total } of active) {
    const name = repo.name;
    const color = colorFor(name);
    for (const w of weeks) {
      weekKeys.add(w.weekStart);
      const id = `${name}_${w.weekStart}`.replace(/[^a-zA-Z0-9_-]/g, "-");
      writes.set(db.doc(`users/${uid}/codeActivity/${id}`), {
        weekStart: w.weekStart,
        label: w.label,
        repoName: displayName(name),
        color,
        lines: w.lines,
      });
      if (++ops >= 400) await flush();
    }
    writes.set(db.doc(`users/${uid}/repos/${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`), {
      name,
      displayName: displayName(name),
      fullName: repo.full_name,
      url: repo.html_url,
      color,
      isPrivate: repo.private,
      language: repo.language ?? "",
      totalLines: total,
      pushedAt: repo.pushed_at,
    });
    if (++ops >= 400) await flush();
  }

  writes.set(db.doc(`users/${uid}/codeMeta/status`), {
    syncedAt: new Date().toISOString(),
    repoCount: active.length,
    weekCount: weekKeys.size,
  });
  ops++;
  await flush();

  return NextResponse.json({
    ok: true,
    reposScanned: repos.length,
    reposWithActivity: active.length,
    weeks: weekKeys.size,
  });
}

async function clearCollection(db: FirebaseFirestore.Firestore, path: string) {
  const snap = await db.collection(path).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
