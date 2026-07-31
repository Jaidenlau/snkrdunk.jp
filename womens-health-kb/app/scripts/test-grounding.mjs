// Proof that the grounding gate accepts real quotes and rejects fabricated ones.
// Fixtures are the actual text retrieved from the sources during verification.
import { groundQuote } from "../lib/grounding.mjs";

// Real retrieved source text (from the live sources).
const PMC_TEXT = `About 98% of participants in a study reported practicing "Zuo Yuezi", among whom 41.2% followed traditional customs. Approximately 95% of women practiced "Zuo Yuezi" for ≥30 days, and nearly half strictly followed a 30-day "Zuo Yuezi" period. Zuo yuezi included: dietary precautions, such as eating more food and avoiding cold food; behavioral precautions, such as staying inside the home; hygiene precautions, such as restricting bathing and dental hygiene; and practices associated with infant feeding.`;

const ACOG_TEXT = `You should seek emergency help right away if you experience heavy bleeding (bleeding that soaks through two sanitary pads an hour for more than an hour or two).`;

const NHS_TEXT = `You should have your postnatal check 6 to 8 weeks after your baby's birth to make sure you feel well and are recovering properly. You'll have bleeding (lochia) from your vagina for a few weeks after you give birth. The bleeding usually stops after 6 to 8 weeks, but it can last longer.`;

const cases = [
  {
    name: "PMC 95% quote (real, ≥ vs >=)",
    text: PMC_TEXT,
    quote: 'Approximately 95% of women practiced "Zuo Yuezi" for >=30 days, and nearly half strictly followed a 30-day "Zuo Yuezi" period.',
    expect: true,
  },
  {
    name: "PMC bathing quote (real, fragmented with ...)",
    text: PMC_TEXT,
    quote: "Zuo yuezi included ... hygiene precautions, such as restricting bathing and dental hygiene ...",
    expect: true,
  },
  {
    name: "ACOG two-pads quote (real)",
    text: ACOG_TEXT,
    quote: "bleeding that soaks through two sanitary pads an hour for more than an hour or two",
    expect: true,
  },
  {
    name: "NHS 6-8 week check (real)",
    text: NHS_TEXT,
    quote: "You should have your postnatal check 6 to 8 weeks after your baby's birth to make sure you feel well and are recovering properly.",
    expect: true,
  },
  {
    name: "FABRICATED analytic sentence (must be rejected)",
    text: NHS_TEXT,
    quote: "NHS frames recovery as gradual and individual with a formal 6–8 week check — contrasts with a structured 30-day confinement model.",
    expect: false,
  },
  {
    name: "PLAUSIBLE but wrong threshold (must be rejected)",
    text: ACOG_TEXT,
    quote: "bleeding that soaks through one sanitary pad an hour",
    expect: false,
  },
];

let pass = 0;
for (const c of cases) {
  const r = groundQuote(c.text, c.quote);
  const ok = r.grounded === c.expect;
  pass += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"}  grounded=${String(r.grounded).padEnd(5)} (${r.method})  ${c.name}`);
}
console.log(`\n${pass}/${cases.length} cases passed`);
process.exit(pass === cases.length ? 0 : 1);
