"use client";

import { Suspense } from "react";
import CardioLogger from "@/components/lifts/CardioLogger";

// Suspense boundary: CardioLogger reads useSearchParams() for prefill.
export default function CardioPage() {
  return (
    <Suspense fallback={null}>
      <CardioLogger />
    </Suspense>
  );
}
