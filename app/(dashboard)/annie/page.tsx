"use client";

import AnnieInterests from "@/components/AnnieInterests";
import AnnieMoments from "@/components/AnnieMoments";
import { ANNIE_BORN, ageString, prettyDateLong } from "@/lib/dates";

export default function AnniePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Annie</h1>
        <p className="text-sm text-muted">
          {ageString(ANNIE_BORN)} · born {prettyDateLong(ANNIE_BORN)}
        </p>
      </header>

      <AnnieInterests />
      <AnnieMoments />
    </div>
  );
}
