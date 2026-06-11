import type { SynthesisIssue } from "./synthesis.js";

// Word tokens for shingle matching (alphanumeric runs, case-insensitive).
const WORD = "[A-Za-z0-9]+";
const normWords = (s: string): string[] => s.toLowerCase().match(new RegExp(WORD, "g")) ?? [];

/** n-word shingles present in `source` but NOT in `draft` (normalized). */
function sourceOnlyShingles(source: string, draft: string, n: number): Set<string> {
  const shingles = (ws: string[]): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i + n <= ws.length; i++) set.add(ws.slice(i, i + n).join(" "));
    return set;
  };
  const draftSh = shingles(normWords(draft));
  const out = new Set<string>();
  for (const sh of shingles(normWords(source))) if (!draftSh.has(sh)) out.add(sh);
  return out;
}

/**
 * STRUCTURAL privacy scrub. Replace, with `[redacted]`, any span of `text` that
 * appears in `source` but NOT in `draft`. Spans present in the draft (what the
 * approver already reads) are kept; only source-only material is stripped.
 *
 * Used on the below-floor objection log: the judge is given the self-review (source)
 * but its objections are persisted to the approver-visible `flag_detail`, and the
 * approver has subject-only RLS on `self_reviews`. The privacy boundary must be
 * enforced here, not by the judge prompt (privacy boundaries are structural, never
 * prompt-guarded). `n` is small (default 3) so even short verbatim source spans are
 * caught; over-redaction is harmless (draft-present spans are never touched).
 */
export function redactSourceOnlySpans(text: string, source: string, draft: string, n = 3): string {
  const sourceOnly = sourceOnlyShingles(source, draft, n);
  if (sourceOnly.size === 0) return text;

  // tokenize `text` keeping each word's char offsets, so we can splice in place.
  const toks: { start: number; end: number; w: string }[] = [];
  const re = new RegExp(WORD, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) toks.push({ start: m.index, end: m.index + m[0].length, w: m[0].toLowerCase() });

  // any n-word window that is a source-only shingle → mark its char range.
  const ranges: [number, number][] = [];
  for (let i = 0; i + n <= toks.length; i++) {
    const window = toks.slice(i, i + n).map((t) => t.w).join(" ");
    const first = toks[i];
    const last = toks[i + n - 1];
    if (first && last && sourceOnly.has(window)) ranges.push([first.start, last.end]);
  }
  if (ranges.length === 0) return text;

  // merge overlapping/adjacent ranges, then splice right-to-left (offsets stay valid).
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = text;
  for (let i = merged.length - 1; i >= 0; i--) {
    const r = merged[i];
    if (r) out = `${out.slice(0, r[0])}[redacted]${out.slice(r[1])}`;
  }
  return out;
}

/**
 * Scrub a synthesis objection log so NO source-only (self-review) span survives into
 * the persisted, approver-visible `flag_detail`. Draft-quoting specifics — what the
 * manager needs to act on the flag — are preserved (they are present in the draft).
 */
export function redactObjectionLog(issues: SynthesisIssue[], source: string, draft: string): SynthesisIssue[] {
  return issues.map((i) => ({ category: i.category, detail: redactSourceOnlySpans(i.detail, source, draft) }));
}
