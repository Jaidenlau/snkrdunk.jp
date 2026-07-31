"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  // useSearchParams must be under a Suspense boundary for the production build.
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (r.ok) {
      router.push(params.get("next") || "/");
      router.refresh();
    } else {
      setError("Incorrect password");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-plum-600 text-white font-serif text-2xl mb-4">V</div>
          <h1 className="text-xl font-semibold tracking-tight">Verified Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted">Pregnancy &amp; Postpartum · Private</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none focus:border-plum-400"
              placeholder="Enter access password"
            />
          </div>
          {error && <p className="text-sm text-anec-fg">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
        <p className="mt-4 text-center text-[11px] text-muted">Evidence-strength curation, not medical advice.</p>
      </div>
    </div>
  );
}
