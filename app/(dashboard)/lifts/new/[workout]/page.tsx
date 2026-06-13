"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import WorkoutLogger from "@/components/lifts/WorkoutLogger";

export default function NewWorkoutPage() {
  const params = useParams<{ workout: string }>();
  const key = (params.workout ?? "").toLowerCase();
  const valid = ["a", "b", "c", "empty"].includes(key);

  if (!valid) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Unknown workout.</p>
        <Link href="/lifts" className="btn-ghost inline-flex">Back to Lifts</Link>
      </div>
    );
  }

  return <WorkoutLogger workoutKey={key} />;
}
