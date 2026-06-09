import type { ReviewStatus } from "@transforma/db";

/**
 * The legal transition graph — the single source of truth for the lifecycle.
 * Mirrors `app.is_legal_transition` in SQL (DB backstop). `locked` and `aborted`
 * are terminal (no outbound edge) — this is how non-negotiable #2 ("no post-lock
 * correction") is encoded: there is no path out of `locked`.
 */
export const LEGAL: Record<ReviewStatus, readonly ReviewStatus[]> = {
  draft: ["in-review", "aborted"],
  "in-review": ["flagged", "awaiting-acknowledgement", "aborted", "blocked_sod"],
  flagged: ["in-review", "awaiting-acknowledgement", "aborted", "blocked_sod"],
  blocked_sod: ["in-review", "flagged", "aborted"],
  "awaiting-acknowledgement": ["locked"],
  locked: [],
  aborted: [],
};

export function isLegalTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return LEGAL[from].includes(to);
}

export function isTerminal(status: ReviewStatus): boolean {
  return LEGAL[status].length === 0;
}
