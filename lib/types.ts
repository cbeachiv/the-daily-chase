// Shared Firestore document shapes. All live under users/{uid}/<collection>.

export interface Task {
  id: string;
  title: string;
  notes?: string;
  dueDate: string; // YYYY-MM-DD — the day it's assigned to
  completedAt: string | null; // ISO timestamp when completed, else null
  sortOrder: number;
  carriedCount: number; // how many days it has rolled over unfinished
  createdAt: string;
}

export interface Quote {
  id: string;
  text: string;
  author: string;
  date: string; // YYYY-MM-DD (datestamp)
  createdAt: string;
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
  notes?: string; // free-text notes from the trip
  createdAt: string;
}

export interface MoodLog {
  id: string;
  date: string; // YYYY-MM-DD (for grouping/filtering)
  loggedAt: string; // ISO timestamp — the exact moment logged
  mood: number; // 1–10
  energy: number; // 1–10
  // structured context factors (all optional)
  caffeineCups?: number; // # coffees so far today
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
