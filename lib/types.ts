// Shared Firestore document shapes. All live under users/{uid}/<collection>.

// Which area of life a to-do belongs to. Used to split the weekly review's
// completed to-dos; untagged tasks are AI-classified at email-build time.
export type TaskCategory = "hugga" | "personal";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  dueDate: string; // YYYY-MM-DD — the day it's assigned to
  completedAt: string | null; // ISO timestamp when completed, else null
  category?: TaskCategory; // "hugga" (work) vs "personal"; undefined = untagged
  projectId?: string; // optional link to a TrackedProject
  sortOrder: number;
  carriedCount: number; // how many days it has rolled over unfinished
  createdAt: string;
}

export interface Milestone {
  id: string; // local uuid (crypto.randomUUID())
  title: string;
  done: boolean;
}

// users/{uid}/trackedProjects — active work Chase is pushing forward. Progress is
// the share of milestones done. Mirrors the embedded-array + active/archived
// pattern used by AnnieInterest / Injury. Distinct from the portfolio `projects`
// collection (Project, below), which is a showcase, not a live tracker.
export interface TrackedProject {
  id: string;
  name: string;
  description?: string;
  category: TaskCategory; // "hugga" | "personal" — same vocab as to-dos
  status: "active" | "archived"; // archived = finished/parked, hidden by default
  milestones: Milestone[];
  link?: string; // optional URL (repo, site, doc)
  startDate?: string; // YYYY-MM-DD — when work actually began; falls back to createdAt's date
  targetDate?: string; // YYYY-MM-DD — when you want to finish (optional)
  sortOrder: number;
  createdAt: string; // ISO timestamp — when the project record was created
}

export interface Quote {
  id: string;
  text: string;
  author: string;
  date: string; // YYYY-MM-DD (datestamp)
  createdAt: string;
}

// One doc per day, id = the date. Pre-created by the 4:30pm daily-review cron
// (status:"pending") and filled in when Chase does the reflection on /review.
export interface DailyReview {
  id: string; // = date, "YYYY-MM-DD" (one per day)
  date: string; // YYYY-MM-DD
  productive: boolean | null; // "was today productive?" — null until answered
  productivityScore?: number; // optional 1–5 for trend data
  whatMadeIt: string; // what made it productive / not
  learned: string; // what you learned today
  aiQuestion: string; // the tailored follow-up shown that day (set by the cron)
  aiAnswer: string; // free-text reply to the AI follow-up
  completedTaskTitles: string[]; // snapshot of to-dos done that day
  weekGoalsDone: number;
  weekGoalsTotal: number;
  monthGoalsDone: number;
  monthGoalsTotal: number;
  status: "pending" | "done"; // pending = email sent, awaiting reflection
  loggedAt: string | null; // ISO timestamp when the reflection was submitted
  createdAt: string;
}

// Weekly counterpart to DailyReview (doc id = weekEnding Saturday). The Saturday
// 5am email pre-creates this with the week's snapshot + a tailored question; the
// /weekly-review page fills in the free-text reflection (incl. family prompts).
export interface WeeklyReview {
  id: string; // = weekEnding "YYYY-MM-DD" (one per week)
  weekEnding: string; // Saturday that closes the Monday-based week
  // free-text reflection answers
  weekHighlights: string; // how the week went
  goalsReflection: string; // feelings toward weekly/monthly goals
  trainingReflection: string; // how lifts/cardio went
  moodReflection: string; // how mood/energy actually felt
  sarahAnnieAttention: string; // attention given to Sarah & Annie
  annieNoticed: string; // anything noticed with Annie
  familyFriends: string; // parents, friends to reach out to
  aiQuestion: string; // tailored weekly follow-up (set by the cron)
  aiAnswer: string;
  // snapshot of the week (set by the cron, like DailyReview)
  tasksDoneCount: number;
  weekGoalsDone: number;
  weekGoalsTotal: number;
  monthGoalsDone: number;
  monthGoalsTotal: number;
  daysReflected: number; // # daily reviews completed this week
  productiveDays: number; // # of those marked productive
  status: "pending" | "done";
  loggedAt: string | null;
  createdAt: string;
  // When `annieNoticed` is filled, it flows into the Annie timeline as a moment.
  // We keep that moment's id here so re-saving updates it instead of duplicating.
  annieMomentId?: string;
}

// users/{uid}/annieInterests — the heart of the Annie page. Each interest is a
// curiosity with a lifecycle: discovered → fed (observations + facilitation) →
// archived once it fades, building a record of how her curiosity evolved.
export interface AnnieInterest {
  id: string;
  title: string; // e.g. "Opening & closing cabinet doors"
  status: "active" | "archived";
  startedAt: string; // YYYY-MM-DD — when it was discovered
  endedAt: string | null; // YYYY-MM-DD when archived, else null
  observations: { at: string; text: string }[]; // running "what I noticed" notes
  facilitation: { at: string; text: string; done: boolean }[]; // "ways I'm feeding it" checklist
  sortOrder: number;
  createdAt: string;
}

export type AnnieMomentKind =
  | "first"
  | "milestone"
  | "funny"
  | "moment"
  | "note"
  | "ageUpdate"; // monthly photo update — "she's N months old"

// users/{uid}/annieMoments — the fast feed: dated entries with optional photo/video + tag.
export interface AnnieMoment {
  id: string;
  date: string; // YYYY-MM-DD (backdatable)
  text: string;
  kind?: AnnieMomentKind;
  photoUrl?: string; // Firebase Storage download URL (photo or video)
  photoPath?: string; // storage path, kept so the file can be deleted
  mediaType?: "image" | "video"; // how to render photoUrl; absent = image (legacy)
  interestId?: string; // optional link to an AnnieInterest
  source?: "weekly"; // set when auto-created from the weekly review
  createdAt: string;
}

// Evolving "About Chase" profile (doc id "latest"). Refined by Claude each time a
// daily reflection is submitted; feeds back into the next day's tailored question.
export interface AboutProfile {
  id: string;
  summary: string; // evolving narrative of who Chase is / how he works
  traits: string[]; // bullet observations (work style, motivators, blockers)
  updatedAt: string;
  reviewsSeen: number; // how many reflections have shaped this profile
}

export type GoalPeriod = "week" | "month";

export interface Goal {
  id: string;
  period: GoalPeriod;
  periodStart: string; // YYYY-MM-DD (Monday for weeks, 1st for months)
  title: string;
  description?: string;
  done: boolean;
  aiGenerated: boolean;
  createdAt: string;
}

export interface Workout {
  id: string;
  date: string; // YYYY-MM-DD
  type: string;
  durationMin?: number;
  notes?: string;
  createdAt: string;
}

// One doc per day you got up at 5am — presence = success, absence = didn't.
// Mirrors the Workout boolean-by-presence pattern so streaks/counts are easy.
export interface WakeupLog {
  id: string;
  date: string; // YYYY-MM-DD
  loggedAt: string; // ISO timestamp — when it was logged
  createdAt: string;
}

export interface WeightLog {
  id: string;
  date: string; // YYYY-MM-DD (one per day)
  weightLbs: number;
  createdAt: string;
}

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  calories: number;
  label?: string;
  createdAt: string;
}

export interface Travel {
  id: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  notes?: string;
  flightsBooked?: boolean;
  lodgingBooked?: boolean;
  createdAt: string;
}

export interface HuggaTrip {
  id: string;
  date: string; // YYYY-MM-DD — when the visit happened
  stayType?: "day" | "overnight"; // day trip vs overnight stay
  notes?: string; // free-text notes from the trip
  createdAt: string;
}

export interface CallLog {
  id: string;
  date: string; // YYYY-MM-DD — backdatable
  time: string; // "HH:MM"
  person: string; // who the call was with
  notes?: string;
  createdAt: string;
}

// One doc per coffee — created by tapping "Log Coffee" the moment it's drunk,
// so coffee timing can be correlated against mood/energy.
export interface CoffeeLog {
  id: string;
  date: string; // YYYY-MM-DD (for daily counts)
  loggedAt: string; // ISO timestamp — when the coffee was logged
  createdAt: string;
}

export interface MoodLog {
  id: string;
  date: string; // YYYY-MM-DD (for grouping/filtering)
  loggedAt: string; // ISO timestamp — the exact moment logged
  mood: number; // 1–10
  energy: number; // 1–10
  // structured context factors (all optional)
  caffeineCups?: number; // # coffees so far today — snapshotted from coffeeLogs at save time
  alcoholDrinks?: number; // # alcoholic drinks
  exercised?: boolean; // worked out today
  bedtime?: string; // "HH:MM" — time went to bed last night
  wakeTime?: string; // "HH:MM" — time woke up
  // sleep duration is derived from bedtime/wakeTime when both are set
  // AI follow-up
  aiQuestion?: string; // the contextual question Claude asked
  aiAnswer?: string; // user's free-text reply (optional)
  notes?: string;
  createdAt: string;
}

export interface InjuryCheckIn {
  date: string; // YYYY-MM-DD
  pain: number; // 0–10 (0 = pain-free)
  note?: string;
}

// users/{uid}/injuries — an injury with a recovery lifecycle. The initial
// report seeds checkIns[0]; weekly check-ins append a pain score + note so
// the trend shows whether it's healing. Mirrors AnnieInterest's embedded-array
// + active/archived pattern.
export interface Injury {
  id: string;
  bodyPart: string; // e.g. "Left elbow (inner)"
  description: string; // what happened / likely diagnosis
  startDate: string; // YYYY-MM-DD — when it occurred
  status: "active" | "recovered";
  recoveredDate?: string; // YYYY-MM-DD — set when marked recovered
  checkIns: InjuryCheckIn[]; // dated pain/note entries, oldest→newest
  createdAt: string;
}

export interface CodeActivity {
  id: string;
  weekStart: string; // YYYY-MM-DD label key (also stores the display label)
  label: string; // e.g. "Feb 9"
  repoName: string;
  color: string;
  lines: number;
}

export interface Repo {
  id: string;
  name: string; // GitHub repo name
  displayName: string;
  fullName: string; // owner/name
  url: string;
  color: string;
  isPrivate: boolean;
  language?: string;
  totalLines: number; // additions summed over the synced window
  pushedAt: string; // ISO
}

export interface CodeSyncMeta {
  id: string;
  syncedAt: string;
  repoCount: number;
  weekCount: number;
}

export interface Project {
  id: string;
  displayName: string;
  description: string;
  siteUrl?: string;
  appUrl?: string;
  isPrevious: boolean;
  badge?: "Acquired" | "Wound Down" | "Completed";
  dates?: string;
  outcome?: string;
  sortOrder: number;
}

// ── Finance ────────────────────────────────────────────────────────────────
// Normalized spend/income categories. Raw category strings from card exports
// are mapped onto this clean set in lib/finance.ts (CATEGORY_MAP).
export type FinanceCategory =
  | "Eating Out"
  | "Groceries"
  | "Amazon"
  | "Health"
  | "Travel"
  | "Rent"
  | "Income"
  | "Transfer"
  | "Sarah Discretionary"
  | "Chase Discretionary"
  | "Subscription"
  | "Annie";

export type FinanceSource = "capitalone" | "chase" | "manual" | "recurring" | "plaid";

// users/{uid}/financeTransactions — one row per transaction. Doc id is a
// deterministic dedupe hash (source|date|amount|description), so re-uploading a
// month's CSV is idempotent. Amounts are signed: negative = money out (expense),
// positive = money in (income/credit). `excluded` rows (card payments, internal
// transfers) are kept for the record but left out of spend/income totals so the
// same dollar isn't counted twice across the Chase + Capital One feeds.
export interface FinanceTransaction {
  id: string;
  date: string; // YYYY-MM-DD (transaction date)
  month: string; // YYYY-MM — denormalized for cheap month filtering
  description: string;
  amount: number; // signed dollars; negative = expense, positive = income
  category: FinanceCategory;
  rawCategory?: string; // original category string from the export, if any
  source: FinanceSource;
  excluded: boolean; // true = don't count toward spend/income (payments, transfers)
  note?: string; // free text; holds enriched Amazon item lists
  descriptionOverride?: string; // user-set label; shown instead of `description`, survives syncs
  pending?: boolean; // Plaid: transaction not yet posted (may change/disappear)
  plaidItemId?: string; // Plaid: which connected item this came from
  createdAt: string;
}

// Sanitized view of a connected Plaid item, returned by /api/plaid/items for the
// "Connected accounts" UI. The access token itself lives in a server-only,
// client-denied top-level `plaidItems` collection and never reaches the browser.
export interface PlaidItemView {
  itemId: string;
  institutionName: string;
  accounts: { accountId: string; name: string; mask?: string; subtype?: string }[];
  status: "active" | "login_required" | "error";
  lastSyncedAt?: string;
  error?: string;
}

// users/{uid}/financeRecurring — fixed monthly expenses that don't reliably show
// on a card (rent, office rent, subscriptions). "Add this month" inserts each
// active item as a source:"recurring" FinanceTransaction (idempotent per month).
export interface FinanceRecurring {
  id: string;
  label: string;
  amount: number; // positive dollars — the monthly cost
  category: FinanceCategory;
  dayOfMonth?: number; // 1–31, when it's typically paid (default 1)
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

// users/{uid}/financeSnapshots — one doc per month (id = "YYYY-MM"). Manual
// monthly entry of investment/savings balances + notable-items notes, mirroring
// the budget spreadsheet's rows. `income`/`spend` are optional fallbacks used for
// historical months that predate imported transactions.
export interface FinanceSnapshot {
  id: string; // = month "YYYY-MM"
  month: string; // "YYYY-MM"
  bitcoin?: number;
  ira?: number;
  savings?: number; // liquid savings balance (month-end)
  hugga?: number; // Hugga investment balance
  rent?: number; // rent paid that month (part of total spend)
  cashChecking?: number;
  income?: number; // fallback monthly income when no transactions exist
  spend?: number; // fallback TOTAL monthly spend (incl. rent) when no transactions exist
  notes?: string; // itemized notable items, like the PDF footnotes
  createdAt: string;
  updatedAt?: string;
}
