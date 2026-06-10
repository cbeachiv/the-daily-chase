"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, signInWithGate } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/today");
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithGate(password);
      router.replace("/today");
    } catch {
      setError("Incorrect password.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 bg-gradient-to-r from-sky via-indigo to-teal bg-clip-text text-center text-3xl font-extrabold tracking-tight text-transparent">
          The Daily Chase
        </h1>
        <p className="mb-8 text-center text-sm text-muted">Enter your password</p>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-coral">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
