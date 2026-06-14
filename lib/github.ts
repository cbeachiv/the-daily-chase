// GitHub sync helpers: list accessible repos and compute weekly lines added
// per repo from the code-frequency stats endpoint.

const API = "https://api.github.com";

// Trailing window of weeks to chart.
export const WEEKS_WINDOW = 20;

export interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  language: string | null;
  pushed_at: string;
}

// Preserve the nice display names + colors from the original site; fall back to
// title-casing + a hashed palette for anything new.
const DISPLAY_NAMES: Record<string, string> = {
  "guests-first-ios": "Guests First iOS",
  hugga: "Guests First",
  "hugga-retreats-website": "Hugga Retreats",
  "hugga-email-newsletter": "Hugga Email Newsletter",
  "hugga-integrations": "Hugga Integrations",
  "hugga-picklelodge-partnership": "Hugga x Pickle Lodge",
  visitmariemont: "Visit Mariemont",
  potofhugga: "Pot of Hugga",
  "nc-agent-core": "NC Agent Core",
  "sbi-website": "Sarah Beach Interiors",
  "left-vs-right-brain": "Left vs Right Brain",
  "the-daily-chase": "The Daily Chase",
  leucadia: "Where Does Leucadia Start?",
  "siding-quote-generator": "Siding Quote Generator",
};

const KNOWN_COLORS: Record<string, string> = {
  "guests-first-ios": "#10b981",
  visitmariemont: "#6366f1",
  "hugga-retreats-website": "#14b8a6",
  "hugga-email-newsletter": "#a855f7",
  "nc-agent-core": "#0ea5e9",
  "hugga-picklelodge-partnership": "#f97316",
  potofhugga: "#f59e0b",
  leucadia: "#06b6d4",
  "sbi-website": "#e11d48",
  "left-vs-right-brain": "#d97706",
  "the-daily-chase": "#8b5cf6",
  "hugga-integrations": "#22d3ee",
};

const PALETTE = [
  "#ff6b6b", "#f59e0b", "#14b8a6", "#6366f1", "#ec4899", "#0ea5e9",
  "#10b981", "#a855f7", "#f97316", "#06b6d4", "#8b5cf6", "#e11d48",
  "#22d3ee", "#d97706", "#84cc16", "#db2777",
];

function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function displayName(name: string): string {
  return DISPLAY_NAMES[name.toLowerCase()] ?? titleCase(name);
}

export function colorFor(name: string): string {
  return KNOWN_COLORS[name.toLowerCase()] ?? PALETTE[hash(name) % PALETTE.length];
}

async function gh(path: string, token: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

/** All non-fork, non-archived repos the token can read. */
export async function listRepos(token: string): Promise<GhRepo[]> {
  const repos: GhRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await gh(
      `/user/repos?per_page=100&page=${page}&affiliation=owner,organization_member,collaborator&sort=pushed`,
      token
    );
    if (!res.ok) throw new Error(`GitHub repos error ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as GhRepo[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork && !r.archived);
}

export interface WeekBucket {
  weekStart: string; // YYYY-MM-DD, the Sunday of that week (UTC)
  label: string; // e.g. "Jun 8"
  lines: number;
}

// Sunday-start week key for a date (UTC), to match GitHub's week convention.
function weekOf(date: Date): { weekStart: string; label: string } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return {
    weekStart: d.toISOString().slice(0, 10),
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

const GQL = `
query($owner:String!,$name:String!,$since:GitTimestamp!,$cursor:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{ target{ ... on Commit {
      history(since:$since, first:100, after:$cursor){
        pageInfo{ hasNextPage endCursor }
        nodes{ committedDate additions parents{ totalCount } }
      }
    }}}
  }
}`;

interface CommitNode {
  committedDate: string;
  additions: number;
  parents: { totalCount: number };
}

interface GqlResponse {
  data?: {
    repository?: {
      defaultBranchRef?: {
        target?: {
          history?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: CommitNode[];
          };
        } | null;
      } | null;
    } | null;
  };
}

/**
 * Lines added per week for a repo's default branch since `sinceISO`, summed
 * from per-commit additions via GraphQL. Skips merge commits to avoid
 * double-counting. No 202/"computing" wait, unlike the stats endpoints.
 */
export async function weeklyAdditions(
  owner: string,
  name: string,
  sinceISO: string,
  token: string
): Promise<WeekBucket[]> {
  const totals = new Map<string, { label: string; lines: number }>();
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: GQL, variables: { owner, name, since: sinceISO, cursor } }),
    });
    if (!res.ok) break;
    const json = (await res.json()) as GqlResponse;
    const history = json.data?.repository?.defaultBranchRef?.target?.history;
    if (!history) break;

    for (const c of history.nodes) {
      if (c.parents.totalCount > 1 || c.additions <= 0) continue; // skip merges
      const { weekStart, label } = weekOf(new Date(c.committedDate));
      const cur = totals.get(weekStart) ?? { label, lines: 0 };
      cur.lines += c.additions;
      totals.set(weekStart, cur);
    }

    if (!history.pageInfo.hasNextPage) break;
    cursor = history.pageInfo.endCursor;
  }

  return [...totals.entries()].map(([weekStart, v]) => ({
    weekStart,
    label: v.label,
    lines: v.lines,
  }));
}

/**
 * Total lines added to a repo's default branch within [sinceISO, untilISO),
 * summed from per-commit additions (merge commits skipped). Lets callers pick an
 * exact day range (e.g. a Monday–Sunday week) instead of GitHub's Sunday buckets.
 */
export async function additionsInRange(
  owner: string,
  name: string,
  sinceISO: string,
  untilISO: string,
  token: string
): Promise<number> {
  let total = 0;
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: GQL, variables: { owner, name, since: sinceISO, cursor } }),
    });
    if (!res.ok) break;
    const json = (await res.json()) as GqlResponse;
    const history = json.data?.repository?.defaultBranchRef?.target?.history;
    if (!history) break;

    for (const c of history.nodes) {
      if (c.parents.totalCount > 1 || c.additions <= 0) continue; // skip merges
      if (c.committedDate >= untilISO) continue; // outside upper bound
      total += c.additions;
    }

    if (!history.pageInfo.hasNextPage) break;
    cursor = history.pageInfo.endCursor;
  }

  return total;
}
