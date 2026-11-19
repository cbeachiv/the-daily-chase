"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import WeatherReportView, { C, Skeleton } from "@/components/weather/WeatherReportView";
import type { WeatherReport } from "@/lib/weather/report";

export default function WeatherPage() {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setError("");
    if (refresh) setRefreshing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/weather${refresh ? "?refresh=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load the forecast.");
      setReport(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the forecast.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      className="-mx-4 -mt-5 min-h-[80vh] px-6 pb-16 pt-8 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-12 sm:pt-12"
      style={{ background: C.bg, color: C.ink }}
    >
      {!report && !error && <Skeleton />}
      {error && !report && (
        <div className="py-24 text-center" style={{ color: C.muted }}>
          <p>{error}</p>
          <button onClick={() => load()} className="mt-4 underline" style={{ color: C.accent }}>
            try again
          </button>
        </div>
      )}
      {report && <WeatherReportView r={report} onRefresh={() => load(true)} refreshing={refreshing} />}
    </div>
  );
}

