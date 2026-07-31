// Deterministic verbatim grounding — the anti-hallucination gate.
// A quote is "grounded" only if it appears, character-for-character (after
// conservative normalization), in the text actually retrieved from the source.
// This is a string operation, NOT a model judgment: a quote the source does not
// contain cannot pass, no matter how plausible it sounds.

// Conservative normalization: unify unicode punctuation the two texts may differ
// on, collapse whitespace, lowercase. We deliberately keep words and numbers
// intact so we don't create false matches.
export function normalizeForMatch(s) {
  return String(s)
    .replace(/’|‘|′/g, "'")      // curly/prime apostrophes -> '
    .replace(/“|”|″/g, '"')      // curly quotes -> "
    .replace(/–|—|‒/g, "-")      // en/em dashes -> -
    .replace(/…/g, "...")                   // ellipsis char -> ...
    .replace(/≥/g, ">=")                    // ≥ -> >=
    .replace(/≤/g, "<=")                    // ≤ -> <=
    .replace(/ /g, " ")                     // nbsp -> space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Ground a quote against retrieved source text.
// Handles quotes that use "..." to elide: each fragment must be present.
// Returns { grounded, method, missing }.
export function groundQuote(sourceText, quote) {
  const src = normalizeForMatch(sourceText);
  const q = normalizeForMatch(quote);
  if (!q) return { grounded: false, method: "empty", missing: [] };

  // Fragmented quote (author used ... to skip material).
  if (q.includes("...")) {
    const fragments = q.split("...").map((f) => f.trim()).filter((f) => f.length >= 8);
    const missing = fragments.filter((f) => !src.includes(f));
    return {
      grounded: fragments.length > 0 && missing.length === 0,
      method: "fragments",
      missing,
    };
  }

  // Whole-quote verbatim.
  if (src.includes(q)) return { grounded: true, method: "verbatim", missing: [] };
  return { grounded: false, method: "none", missing: [q] };
}
