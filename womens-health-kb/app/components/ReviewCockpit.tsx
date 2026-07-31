"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Claim } from "@/lib/types";
import EvidenceBadge from "./EvidenceBadge";
import MarketTag from "./MarketTag";

// A supporting source is "complete" for verification only if it has all three:
// a real URL (retrievable), the exact quote (excerpt), and the date checked.
function sourceComplete(s: any) {
  return Boolean(s.url) && Boolean(s.excerpt) && Boolean(s.checked_on);
}
function claimVerifiable(c: Claim) {
  const supporting = (c.sources || []).filter((s) => s.relation !== "contradicts");
  return supporting.length > 0 && supporting.every(sourceComplete);
}

export default function ReviewCockpit({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState("Autoploy Reviewer");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("whkb_reviewer") : null;
    if (saved) setReviewer(saved);
  }, []);
  useEffect(() => {
    if (reviewer) localStorage.setItem("whkb_reviewer", reviewer);
  }, [reviewer]);

  async function act(action: string, claimId: string) {
    setBusy(claimId + action);
    setError("");
    const r = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, claimId, reviewer }),
    });
    const data = await r.json();
    setBusy(null);
    if (!data.ok) {
      setError(data.error || "Action failed");
      return;
    }
    router.refresh();
  }

  const pending = claims.filter((c) => c.status === "published" && !c.human_confirmed);
  const drafts = claims.filter((c) => c.status === "draft");
  const confirmed = claims.filter((c) => c.status === "published" && c.human_confirmed);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verification cockpit</h1>
          <p className="mt-1 text-muted max-w-xl text-sm">
            Every published claim must trace to a real, retrievable source — with the exact quote, the URL, and
            the date checked. Open each source, confirm the quote, and put your name on it.
          </p>
        </div>
        <label className="text-sm shrink-0">
          <span className="block text-xs uppercase tracking-wide text-muted mb-1">Reviewer</span>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-plum-400"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat n={confirmed.length} label="Human-confirmed" tone="strong" />
        <Stat n={pending.length} label="Pending confirmation" tone="trad" />
        <Stat n={drafts.length} label="Draft (hidden)" tone="anec" />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-anec-dot/40 bg-anec-bg/50 px-4 py-2.5 text-sm text-anec-fg">
          {error}
        </div>
      )}

      <Section title="⏳ Pending your confirmation" hint="Published and visible to users, flagged until a human confirms.">
        {pending.map((c) => (
          <ReviewRow key={c.id} claim={c} busy={busy}
            actions={
              <>
                <button className="btn-primary py-1.5 text-xs" disabled={busy !== null || !claimVerifiable(c)}
                  onClick={() => act("confirm", c.id)}>
                  {busy === c.id + "confirm" ? "…" : "Confirm ✓"}
                </button>
                <GhostBtn onClick={() => act("reject", c.id)} disabled={busy !== null}>Send back to draft</GhostBtn>
              </>
            }
          />
        ))}
        {pending.length === 0 && <Empty>Nothing pending.</Empty>}
      </Section>

      <Section title="📝 Drafts — unverified, hidden from users" hint="Not shown anywhere until they have a verifying quote and are published.">
        {drafts.map((c) => (
          <ReviewRow key={c.id} claim={c} busy={busy}
            actions={
              claimVerifiable(c) ? (
                <button className="btn-primary py-1.5 text-xs" disabled={busy !== null}
                  onClick={() => act("publish", c.id)}>Publish as source-checked</button>
              ) : (
                <span className="text-xs text-muted italic">Needs a source with URL + exact quote + date before it can be published.</span>
              )
            }
          />
        ))}
        {drafts.length === 0 && <Empty>No drafts.</Empty>}
      </Section>

      <Section title="✓ Human-confirmed" hint="A person opened the live source and stood behind it.">
        {confirmed.map((c) => (
          <ReviewRow key={c.id} claim={c} busy={busy}
            actions={<GhostBtn onClick={() => act("unconfirm", c.id)} disabled={busy !== null}>Un-confirm</GhostBtn>}
          />
        ))}
        {confirmed.length === 0 && <Empty>None yet — confirm your first claim above.</Empty>}
      </Section>
    </div>
  );
}

function ReviewRow({ claim, actions, busy }: { claim: Claim; actions: React.ReactNode; busy: string | null }) {
  const supporting = (claim.sources || []).filter((s) => s.relation !== "contradicts");
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <MarketTag code={claim.market} />
        {claim.evidence_level && <EvidenceBadge level={claim.evidence_level} />}
        {claim.human_confirmed && (
          <span className="pill bg-strong-bg text-strong-fg"><span className="h-1.5 w-1.5 rounded-full bg-strong-dot" /> Confirmed by {claim.reviewer}</span>
        )}
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">{claim.topic_domain?.replace("_", " ")}</span>
      </div>
      <p className="text-[15px] leading-relaxed">{claim.statement}</p>
      {claim.confidence_note && (
        <p className="mt-2 text-xs text-muted leading-relaxed border-l-2 border-line pl-2.5">{claim.confidence_note}</p>
      )}

      {supporting.length > 0 && (
        <div className="mt-3 space-y-2">
          {supporting.map((s, i) => (
            <div key={i} className="rounded-lg border border-line bg-canvas p-2.5">
              <div className="flex items-center gap-2 text-[11px]">
                <CheckPill ok={!!s.url} label="URL" />
                <CheckPill ok={!!s.excerpt} label="Quote" />
                <CheckPill ok={!!s.checked_on} label="Date" />
                <span className="ml-auto text-muted">{s.checked_on ? `checked ${new Date(s.checked_on).toISOString().slice(0,10)}` : "no date"}</span>
              </div>
              <div className="mt-1.5 text-xs">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-plum-700 hover:underline break-all">
                    {s.publisher} — open source ↗
                  </a>
                ) : (
                  <span className="text-anec-fg">{s.publisher} — no URL</span>
                )}
              </div>
              {s.excerpt && <p className="mt-1 text-xs italic text-muted">“{s.excerpt}”</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">{actions}</div>
    </div>
  );
}

function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${ok ? "bg-strong-bg text-strong-fg" : "bg-anec-bg text-anec-fg"}`}>
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-muted mb-3">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  const dot: Record<string, string> = { strong: "bg-strong-dot", trad: "bg-trad-dot", anec: "bg-anec-dot" };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-1"><span className={`h-2 w-2 rounded-full ${dot[tone]}`} /><span className="text-xs text-muted">{label}</span></div>
      <div className="text-2xl font-semibold">{n}</div>
    </div>
  );
}
function GhostBtn({ children, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-xl border border-line px-3 py-1.5 text-xs text-muted hover:text-ink hover:border-plum-400 transition-colors disabled:opacity-50">
      {children}
    </button>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
