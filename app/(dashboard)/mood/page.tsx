import { redirect } from "next/navigation";

// Mood now lives inside the Health tab.
export default function MoodRedirect() {
  redirect("/health");
}
