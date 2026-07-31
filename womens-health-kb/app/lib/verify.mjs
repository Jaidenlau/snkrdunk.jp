// The automated verification pipeline. No human in the loop.
// A claim is publishable only if it clears all gates, all machine-checked.
import { groundQuote } from "./grounding.mjs";

const ENTAIL_THRESHOLD = 0.7;

// --- Gate 1: Retrievable ----------------------------------------------------
// Fetch readable text from a source URL. Multi-strategy so bot-blocks don't stop
// us: direct browser-style fetch, then a reader proxy. Returns { ok, text, method }.
export async function retrieveSourceText(url, { timeoutMs = 20000 } = {}) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const strategies = [
    { name: "direct", u: url },
    { name: "reader", u: "https://r.jina.ai/" + url },
  ];
  for (const s of strategies) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(s.u, { headers, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      const text = stripHtml(html);
      if (text && text.length > 200) return { ok: true, text, method: s.name };
    } catch {
      // try next strategy
    }
  }
  return { ok: false, text: "", method: "none" };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// --- Gate 3: Adversarial entailment -----------------------------------------
// A separate verifier model gets ONLY the grounded quotes (never its own memory)
// and is told to try to REFUTE that they support the claim. Returns 0..1 support.
export async function entailClaim(statement, quotes, { apiKey, model } = {}) {
  apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  model = model || process.env.CHAT_MODEL || "claude-3-5-sonnet-latest";
  if (!apiKey) return { supported: null, confidence: null, reason: "no ANTHROPIC_API_KEY", model: null };

  const sys =
    "You are an adversarial fact-checker. You are given a CLAIM and one or more QUOTES taken " +
    "verbatim from sources. Using ONLY the quotes (never outside knowledge), decide whether the " +
    "quotes actually SUPPORT the claim. Actively try to refute it. If the quotes do not clearly " +
    "support the claim, say so. Respond ONLY as compact JSON: " +
    '{"supported": true|false, "confidence": 0.0-1.0, "reason": "..."}';
  const user = `CLAIM: ${statement}\n\nQUOTES:\n${quotes.map((q, i) => `[${i + 1}] "${q}"`).join("\n")}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 300, system: sys, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) return { supported: null, confidence: null, reason: `anthropic ${res.status}`, model };
    const data = await res.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      supported: !!json.supported,
      confidence: json.supported ? Number(json.confidence) : 0,
      reason: json.reason || "",
      model,
    };
  } catch (e) {
    return { supported: null, confidence: null, reason: "entailment error: " + String(e?.message || e), model };
  }
}

// --- Orchestrator -----------------------------------------------------------
// claim: { statement, sources: [{ url, excerpt, relation }] }
// Returns the machine verdict + per-source grounding + recommended status.
export async function verifyClaim(claim, opts = {}) {
  const supporting = (claim.sources || []).filter((s) => s.relation === "supports" && s.excerpt);
  const perSource = [];

  for (const s of supporting) {
    const got = await retrieveSourceText(s.url, opts);
    const g = got.ok ? groundQuote(got.text, s.excerpt) : { grounded: false, method: "unretrievable" };
    perSource.push({ url: s.url, grounded: g.grounded, method: got.ok ? g.method : "unretrievable" });
  }

  const groundedQuotes = supporting.filter((_, i) => perSource[i].grounded).map((s) => s.excerpt);
  const grounded = supporting.length > 0 && perSource.every((p) => p.grounded);
  const corroboration_count = groundedQuotes.length;

  let entail = { supported: null, confidence: null, reason: "not run (nothing grounded)", model: null };
  if (groundedQuotes.length) entail = await entailClaim(claim.statement, groundedQuotes, opts);

  const passes = grounded && typeof entail.confidence === "number" && entail.confidence >= ENTAIL_THRESHOLD;

  return {
    grounded,
    corroboration_count,
    entailment_confidence: entail.confidence,
    entailment_reason: entail.reason,
    verifier_model: entail.model,
    perSource,
    recommendedStatus: passes ? "published" : grounded ? "in_review" : "draft",
  };
}

export { ENTAIL_THRESHOLD };
