"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/data";
import type { Quote } from "@/lib/types";

export default function QuoteOfDay() {
  const { data: quotes } = useCollection<Quote>("quotes");

  // Pick a fresh random quote whenever the page (re)loads. Recomputes once the
  // collection arrives (length 0 -> N), and again on each visit since the
  // component remounts.
  const quote = useMemo(
    () => (quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : null),
    [quotes.length]
  );

  if (!quote) return null;

  return (
    <section className="rounded-card border-l-[3px] border-l-indigo bg-card/60 px-4 py-3">
      <p className="text-[15px] italic leading-snug text-ink">
        &ldquo;{quote.text}&rdquo;
      </p>
      {quote.author && (
        <p className="mt-1 text-sm text-muted">&mdash; {quote.author}</p>
      )}
    </section>
  );
}
