import { runDeterministicGate, type GateContext } from "./gate.js";
import type { NarrativeSections } from "./types.js";

/** A combined issue from either the deterministic gate or the LLM judge. */
export interface SynthesisIssue {
  category: string;
  detail: string;
}

/** The Sonnet judge's verdict (separate model + context from the writer). */
export interface JudgeVerdict {
  pass: boolean;
  issues: SynthesisIssue[];
}

export interface SynthesisDeps {
  /** Writer (Opus). `priorIssues` carries the last attempt's gate failures for regeneration. */
  generate(priorIssues: string[]): Promise<NarrativeSections>;
  /** Judge (Sonnet), separate context. Semantic coverage on top of the deterministic floor. */
  judge(draft: NarrativeSections): Promise<JudgeVerdict>;
}

/** A non-transient generation failure (auth/invalid-request) → abort, never retry. */
export class DeterministicSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeterministicSynthesisError";
  }
}

export type SynthesisOutcome = "ready" | "flagged" | "aborted";

export interface SynthesisResult {
  outcome: SynthesisOutcome;
  draft: NarrativeSections | null;
  attempts: number;
  /** how many times the deterministic gate ran — must equal `attempts` for ready/flagged */
  gateCalls: number;
  issues: SynthesisIssue[];
}

export const MAX_SYNTHESIS_ATTEMPTS = 3;

/**
 * PROC-04 synthesis loop. Pure orchestration over injected model/judge ports —
 * the worker binds the real Anthropic adapter + store I/O around it.
 *
 * The DETERMINISTIC gate is the binding fail-closed floor and runs on EVERY
 * attempt; the Sonnet judge adds semantic coverage on top. A draft is "ready"
 * only if BOTH pass. Gate failures feed back as `priorIssues` for regeneration,
 * up to MAX attempts, then the draft is FLAGGED for manual rework (still a draft).
 * A deterministic generation failure ABORTS (never completes as locked). A
 * transient failure is rethrown so the caller can leave the job queued.
 */
export async function runSynthesis(deps: SynthesisDeps, gateCtx: GateContext): Promise<SynthesisResult> {
  let priorIssues: string[] = [];
  let lastDraft: NarrativeSections | null = null;
  let lastIssues: SynthesisIssue[] = [];
  let gateCalls = 0;

  for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    let draft: NarrativeSections;
    try {
      draft = await deps.generate(priorIssues);
    } catch (e) {
      if (e instanceof DeterministicSynthesisError) {
        return { outcome: "aborted", draft: null, attempts: attempt, gateCalls, issues: [] };
      }
      throw e; // transient → caller leaves the job queued for redelivery
    }
    lastDraft = draft;

    const det = runDeterministicGate(draft, gateCtx); // the binding floor, every attempt
    gateCalls++;
    const verdict = await deps.judge(draft); // semantic coverage on top

    const issues: SynthesisIssue[] = [
      ...det.issues.map((i) => ({ category: i.category as string, detail: i.detail })),
      ...verdict.issues,
    ];
    lastIssues = issues;

    if (det.pass && verdict.pass) {
      // "ready" means BOTH gates passed — it is NOT a guarantee of anonymity.
      // The judge is an LLM: it will occasionally miss a paraphrased rating or a
      // subtle identifier with no verbatim overlap. That miss is CONTAINED — the
      // anonymity guarantee is the deterministic floor (mechanical) PLUS the human
      // approver (semantic backstop, who can see "this names someone" and reject).
      // The judge only reduces how often the human must catch something. Nothing
      // downstream may treat a judge-pass as proof of anonymity.
      return { outcome: "ready", draft, attempts: attempt, gateCalls, issues: [] };
    }
    priorIssues = issues.map((i) => `${i.category}: ${i.detail}`);
  }

  return {
    outcome: "flagged",
    draft: lastDraft,
    attempts: MAX_SYNTHESIS_ATTEMPTS,
    gateCalls,
    issues: lastIssues,
  };
}

export type { GateContext };
