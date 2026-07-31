"use client";
import { useState } from "react";
import { MARKETS, Market } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  text: string;
  disclaimer?: string;
  sources?: any[];
  grounded?: boolean;
}

const SUGGESTIONS = [
  "How does postpartum recovery guidance differ between the US and China?",
  "What are the warning signs after birth?",
  "What confinement practices exist in China?",
];

export default function ChatUI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, markets }),
      });
      const data = await r.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer, disclaimer: data.disclaimer, sources: data.sources, grounded: data.grounded },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong reaching the knowledge base." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-plum-600 text-white font-serif text-2xl mb-4">V</div>
              <h1 className="text-2xl font-semibold tracking-tight">Ask the verified knowledge base</h1>
              <p className="mt-2 text-muted max-w-md mx-auto">
                Every answer is grounded in checked, sourced entries — with the market and evidence rating attached.
              </p>
              <div className="mt-6 flex flex-col items-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="chip max-w-xl text-left">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="rounded-2xl bg-plum-600 text-white px-4 py-2.5 max-w-[80%] text-[15px]">{m.text}</div>
                ) : (
                  <div className="card p-5 max-w-full">
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{m.text}</div>
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-4 border-t border-line pt-3">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted mb-2">Sources</div>
                        <div className="space-y-1.5">
                          {m.sources.map((s: any, j: number) => (
                            <div key={j} className="flex items-start gap-2 text-xs text-muted">
                              <span className="mt-0.5 rounded bg-canvas border border-line px-1.5 py-0.5 text-[10px]">{j + 1}</span>
                              <span>
                                <span className="text-ink">{s.market}</span> · {s.evidence_level?.replace("_", " ")} ·{" "}
                                {s.sources?.map((x: any) => x.publisher).join(", ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {m.disclaimer && <p className="mt-3 text-[11px] italic text-muted">{m.disclaimer}</p>}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="text-sm text-muted animate-pulse">Searching the knowledge base…</div>}
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Filter</span>
            {MARKETS.map((m) => (
              <button
                key={m.code}
                onClick={() => setMarkets((s) => (s.includes(m.code) ? s.filter((x) => x !== m.code) : [...s, m.code]))}
                className={`chip py-1 ${markets.includes(m.code) ? "chip-active" : ""}`}
              >
                {m.flag} {m.code}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any stage, market, or claim…"
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-plum-400"
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
