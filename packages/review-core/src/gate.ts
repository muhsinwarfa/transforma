import { RATING_OPTIONS } from "@transforma/db";
import type { NarrativeSections } from "./types.js";
import { NARRATIVE_SECTION_KEYS } from "./types.js";

/**
 * Deterministic synthesis gate — the BINDING fail-closed control for
 * no-"AI" / no-rating / no-quote / no-identifier (the json_schema constrains
 * shape, not content). Runs on every attempt; the Sonnet judge (Layer B) adds
 * semantic coverage on top.
 *
 * Calibrated for LOW false positives: it strips KNOWN identifying specifics
 * (names, departments, project names, dates passed in `identifiers`) and
 * near-verbatim spans — it does NOT nuke arbitrary proper nouns or ordinary
 * descriptive phrases. On a trip the caller prefers regeneration-with-feedback
 * inside the max-3 loop over a hard flag.
 */
export interface GateContext {
  /** known names / departments / project names / dates to strip (NOT arbitrary capitals) */
  identifiers: string[];
  /** raw self + peer texts — used for verbatim-overlap detection (checking only; never output) */
  rawInputs: string[];
  belowFloor: boolean;
  /** length (in words) of a near-verbatim span that trips the gate */
  shingleWords?: number;
}

export type GateCategory =
  | "formatting"
  | "brand"
  | "rating"
  | "identifier"
  | "verbatim"
  | "peer_attributable";

export interface GateIssue {
  category: GateCategory;
  detail: string;
}

export interface GateResult {
  pass: boolean;
  issues: GateIssue[];
}

// Hardened against a red-team of the gate (see docs/gate-red-team notes). These
// close the MECHANICAL evasions — punctuation tricks ("A.I."), unlisted numeric
// formats ("9/10", "4-star", "perfect 10"), and brand synonyms ("machine-generated",
// "LLM"). The IRREDUCIBLY SEMANTIC evasions the red-team also found — jargon
// brand-synonyms ("synthesis engine", "foundation model"), implied-rating prose
// ("head and shoulders above", "promotion-ready"), UNKNOWN identifiers (project/
// city/person names not in `identifiers`), and PARAPHRASED quotes — cannot be
// caught by regex without unacceptable false positives; they are the LLM judge's
// responsibility (deterministic-AND-judge). Deterministic FPs are cheap: a trip
// drives regenerate-with-feedback, not a hard flag (only 3-attempt exhaustion flags).
const BRAND_PATTERNS: RegExp[] = [
  /\bAI\b/i, // AI / ai
  /\bA\.\s?I\.?/i, // A.I. / A. I.
  /\bA\sI\b/, // A I (caps — avoids lowercase "a i")
  /artificial[\s-]*intelligence/i,
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bopus\b/i,
  /\bsonnet\b/i,
  /\bhaiku\b/i,
  /\b(?:machine|auto|computer|ai)[\s-]generated\b/i,
  /\bL\.?L\.?M\.?s?\b/i, // LLM / L.L.M.
  /\bGPTs?\b/, // GPT
  /\bchat\s?bots?\b/i,
  /\blarge language models?\b/i,
];

const SCORE_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s*\/\s*\d{1,2}\b/, // 4/5, 9/10, 10/10
  /\b\d+(?:\.\d+)?\s*(?:out of|of|on a)\s*\d+\b/i, // 4 out of 5, 8 on a 10
  /\b\d+[\s-]?point scale\b/i, // 10-point scale
  /\b\d+\s*-?\s*stars?\b/i, // 4 stars, 4-star
  /\bperfect (?:10|ten|score)\b/i,
  /\btop[\s-](?:decile|percentile|quartile|tier|band)\b/i, // ranking language
  /\brating\s*[:=]/i, // "rating:"
];

// Peer-attribution phrasing that must never appear in a BELOW-FLOOR (self-only) draft.
const PEER_ATTRIBUTION_PATTERNS: RegExp[] = [
  /colleagues?\s+(describe|say|note|report|mention)/i,
  /peers?\s+(describe|say|note|report|mention)/i,
  /co-?workers?\s+(describe|say|note)/i,
  /teammates?\s+(describe|say|note)/i,
  /others\s+(describe|say|note)/i,
  /trusted by (patients|colleagues|peers|the team)/i,
  /people (describe|say) (them|him|her)/i,
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function allText(sections: NarrativeSections): string {
  return NARRATIVE_SECTION_KEYS.map((k) => sections[k] ?? "").join("\n");
}

/** 8-word (default) shingles of a raw input that appear verbatim in the draft. */
function verbatimSpans(draft: string, rawInput: string, shingleWords: number): string[] {
  const draftN = norm(draft);
  const words = norm(rawInput).split(" ").filter(Boolean);
  const hits: string[] = [];
  for (let i = 0; i + shingleWords <= words.length; i++) {
    const span = words.slice(i, i + shingleWords).join(" ");
    if (span.length >= 24 && draftN.includes(span)) hits.push(span);
  }
  return hits;
}

export function runDeterministicGate(
  sections: NarrativeSections,
  ctx: GateContext,
): GateResult {
  const issues: GateIssue[] = [];
  const shingleWords = ctx.shingleWords ?? 8;

  // (a) formatting — all four sections present and non-empty
  for (const k of NARRATIVE_SECTION_KEYS) {
    if (!sections[k] || norm(sections[k]).length === 0) {
      issues.push({ category: "formatting", detail: `section "${k}" is missing or empty` });
    }
  }

  const text = allText(sections);
  const textN = norm(text);

  // (b) brand — no "AI"/internal layer or model names on a user surface
  for (const re of BRAND_PATTERNS) {
    if (re.test(text)) issues.push({ category: "brand", detail: `banned brand token: ${re}` });
  }

  // (c) rating — no numeric score and no echo of the human RATING_OPTIONS labels
  for (const re of SCORE_PATTERNS) {
    if (re.test(text)) issues.push({ category: "rating", detail: `score-like phrasing: ${re}` });
  }
  for (const opt of RATING_OPTIONS) {
    if (textN.includes(norm(opt))) {
      issues.push({ category: "rating", detail: `echoes a rating label: "${opt}"` });
    }
  }

  // (d) identifier — only KNOWN identifying specifics (calibrated; not all capitals)
  for (const id of ctx.identifiers) {
    const idN = norm(id);
    if (idN.length >= 2 && textN.includes(idN)) {
      issues.push({ category: "identifier", detail: `contains identifying specific: "${id}"` });
    }
  }

  // (e) verbatim — near-verbatim peer/self spans
  for (const raw of ctx.rawInputs) {
    const spans = verbatimSpans(text, raw, shingleWords);
    if (spans.length > 0) {
      issues.push({ category: "verbatim", detail: `near-verbatim span: "${spans[0]}"` });
    }
  }

  // (f) peer-attributable — forbidden in a below-floor (self-only) draft
  if (ctx.belowFloor) {
    for (const re of PEER_ATTRIBUTION_PATTERNS) {
      if (re.test(text)) {
        issues.push({
          category: "peer_attributable",
          detail: `below-floor draft contains peer-attributable claim: ${re}`,
        });
      }
    }
  }

  return { pass: issues.length === 0, issues };
}
