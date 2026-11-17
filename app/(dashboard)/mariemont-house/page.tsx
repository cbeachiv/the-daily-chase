"use client";

import HomeInspiration from "@/components/HomeInspiration";
import HousePlanner from "@/components/house/HousePlanner";

// One home for the Mariemont house: the inspiration board on top, the
// affordability plan underneath.
export default function MariemontHousePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Mariemont House</h1>
      <HomeInspiration />
      <hr className="border-line" />
      <HousePlanner />
    </div>
  );
}
