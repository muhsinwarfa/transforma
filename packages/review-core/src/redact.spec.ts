import { describe, expect, it } from "vitest";
import { redactObjectionLog, redactSourceOnlySpans } from "./redact.js";
import type { SynthesisIssue } from "./synthesis.js";

// Below floor the judge is given the self-review (source); its objections are persisted
// to the approver-visible flag_detail, and the approver has subject-only RLS on
// self_reviews. These prove the STRUCTURAL guarantee: no self-review-only span survives
// into the persisted objection, while draft-quoting specifics (what the manager needs)
// are kept.
const SOURCE = "I personally rescued the failing rollout when the entire team had given up on it";
const DRAFT = "Demonstrated steadiness and ownership during a challenging period of significant change.";

const norm = (s: string): string[] => s.toLowerCase().match(/[A-Za-z0-9]+/g) ?? [];
// every 3-word span that is in the source but not the draft — none may survive redaction
function sourceOnly3(text: string): string[] {
  const draftSh = new Set<string>();
  const dw = norm(DRAFT);
  for (let i = 0; i + 3 <= dw.length; i++) draftSh.add(dw.slice(i, i + 3).join(" "));
  const sw = norm(SOURCE);
  const out: string[] = [];
  for (let i = 0; i + 3 <= sw.length; i++) {
    const sh = sw.slice(i, i + 3).join(" ");
    if (!draftSh.has(sh)) out.push(sh);
  }
  return out;
}
const containsShingle = (text: string, sh: string): boolean => norm(text).join(" ").includes(sh);

describe("redactSourceOnlySpans — self-review text never survives into the objection log", () => {
  it("strips a self-review-only span the judge quoted, keeps the draft-quoting specifics", () => {
    const detail =
      "The draft's strengths section claims more than the self-review states — the self-review says I personally rescued the failing rollout when the entire team, which the draft must not assert as established fact.";
    const out = redactSourceOnlySpans(detail, SOURCE, DRAFT);
    expect(out).not.toMatch(/personally rescued the failing rollout/i); // source span gone
    expect(out).toContain("[redacted]");
    expect(out).toContain("strengths section"); // the judge's own draft-describing words survive
  });

  it("leaves a clean, draft-quoting objection untouched (no source-only span present)", () => {
    const clean = "The draft's summary 'demonstrated steadiness and ownership' could read as an implied rating.";
    expect(redactSourceOnlySpans(clean, SOURCE, DRAFT)).toBe(clean); // draft phrase is not source-only
  });

  it("GUARANTEE: after redaction, NO source-only span survives in any objection detail", () => {
    const issues: SynthesisIssue[] = [
      { category: "fabrication", detail: "Not supported: the self-review only says I personally rescued the failing rollout when the entire team had given up on it." },
      { category: "rating", detail: "The phrase 'demonstrated steadiness and ownership' implies a positive standing." }, // draft-quoting, must survive
    ];
    const out = redactObjectionLog(issues, SOURCE, DRAFT);
    const allDetail = out.map((i) => i.detail).join("\n");
    for (const sh of sourceOnly3(SOURCE)) {
      expect(containsShingle(allDetail, sh)).toBe(false); // every source-only 3-gram is gone
    }
    expect(out).toHaveLength(2);
    expect(out[1]?.detail).toContain("demonstrated steadiness and ownership"); // draft-quoting specifics kept
    expect(out[0]?.detail).toContain("[redacted]");
  });

  it("no source/draft text ⇒ no-op (nothing to redact)", () => {
    expect(redactSourceOnlySpans("anything here", "", "")).toBe("anything here");
  });
});
