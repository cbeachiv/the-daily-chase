"use client";

import HomeInspiration from "@/components/HomeInspiration";
import HouseOutreach from "@/components/HouseOutreach";

// One home for the Mariemont house search: the inspiration board on top, the
// houses we've contacted (and the full land-survey PDF) underneath.
export default function MariemontHousePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Mariemont House</h1>
      <HomeInspiration />
      <hr className="border-line" />
      <HouseOutreach />
    </div>
  );
}
