// Shared Hugga/Personal labels + chip colors, used by to-dos and projects so the
// two areas read with the same vocabulary.
import type { TaskCategory } from "@/lib/types";

export const CAT_LABEL: Record<TaskCategory, string> = {
  hugga: "Hugga",
  personal: "Personal",
};

export const CAT_CHIP: Record<TaskCategory, string> = {
  hugga: "bg-indigo/15 text-indigo",
  personal: "bg-teal/15 text-teal",
};
