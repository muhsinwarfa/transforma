/**
 * Canonical vocabulary — verbatim at the TS/API boundary.
 *
 * RATIFIED DECISION: physical Postgres columns are snake_case; the contract's
 * canonical variable names are preserved VERBATIM here (camelCase) — branded ID
 * types, request/response bodies, and the IDs passed by reference between stages.
 * The snake↔camel mapping is mechanical and lives in ONE place (./codec.ts).
 *
 * There is NO `isOverridden` — the system never produces a rating, so there is
 * nothing to override. `rating` is a human-set field only.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Canonical IDs (contract names, verbatim) ────────────────────────────────
export type CompanyId = Brand<string, "companyId">;
export type CycleId = Brand<string, "cycleId">;
/** The SUBJECT of a review (an account id). */
export type EmployeeId = Brand<string, "employeeId">;
/** The subject's APPROVED peer set for the cycle. */
export type RosterId = Brand<string, "rosterId">;
/** The synthesized narrative draft for a review. */
export type ReviewDraftId = Brand<string, "reviewDraftId">;

// ── Supporting IDs ──────────────────────────────────────────────────────────
export type AccountId = Brand<string, "accountId">;
export type ReviewId = Brand<string, "reviewId">;
export type NominationId = Brand<string, "nominationId">;
export type PeerFeedbackId = Brand<string, "peerFeedbackId">;
export type FeedbackBundleId = Brand<string, "feedbackBundleId">;
export type LockedReviewId = Brand<string, "lockedReviewId">;
export type AuditEntryId = Brand<string, "auditEntryId">;
export type RosterMemberId = Brand<string, "rosterMemberId">;

/** A human who contributed managerial input to a review; excluded from approving it. */
export type InputAuthorId = AccountId;

// ── Review status lifecycle (contract spelling — NOT the prototype UI key) ──
export const REVIEW_STATUSES = [
  "draft",
  "in-review",
  "awaiting-acknowledgement",
  "locked",
  "flagged",
  "aborted",
  "blocked_sod",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ── Rating — human-set only; the system never produces/suggests/computes one ──
export const RATING_OPTIONS = [
  "Exceeds expectations",
  "Meets expectations",
  "Partially meets expectations",
  "Below expectations",
] as const;
export type Rating = (typeof RATING_OPTIONS)[number];

export function isRating(value: unknown): value is Rating {
  return typeof value === "string" && (RATING_OPTIONS as readonly string[]).includes(value);
}

// ── Structural roles (fixed; the system reasons about these) ────────────────
export const STRUCTURAL_ROLES = ["subject", "peer", "approver", "admin"] as const;
export type StructuralRole = (typeof STRUCTURAL_ROLES)[number];

/** Outcome recorded beside a locked review. "Acknowledging is not agreeing." */
export const ACK_OUTCOMES = ["acknowledged", "responded", "window_closed"] as const;
export type AckOutcome = (typeof ACK_OUTCOMES)[number];

/** Unsafe cast helper for boundaries where a raw string is known to be an id. */
export function asId<T extends string>(value: string): T {
  return value as T;
}
