"use client";

import { useCollection } from "@/lib/data";
import type { CodeActivity } from "@/lib/types";
import CodeActivityChart from "@/components/charts/CodeActivityChart";
import SyncButton from "@/components/SyncButton";
import RepoList from "@/components/RepoList";

export default function CodePage() {
  const { data: rows } = useCollection<CodeActivity>("codeActivity");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Code Activity</h1>
          <p className="text-sm text-muted">Lines of code shipped per project.</p>
        </div>
        <SyncButton />
      </header>

      <section className="card p-5 sm:p-7">
        <CodeActivityChart rows={rows} />
      </section>

      <RepoList />
    </div>
  );
}
