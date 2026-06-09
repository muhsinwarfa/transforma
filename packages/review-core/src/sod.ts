import type { AccountId } from "@transforma/db";
import { fail } from "./errors.js";
import type { ReviewView } from "./types.js";

/**
 * Segregation of duties (non-negotiable #1). A review's approver must not be its
 * subject, and must not be anyone who contributed managerial input to it
 * (`inputAuthorId`, plus the plural `contributorIds` set), when set.
 *
 * Pure function over already-loaded data — trivially unit-testable. Mirrors the
 * DB CHECK (`approver_id distinct from employee_id / input_author_id`) and
 * `app.is_eligible_approver`. The DB is the floor; this is the request-time guard.
 */
export function isEligibleApprover(review: ReviewView, candidate: AccountId | null): boolean {
  if (!candidate) return false;
  if (candidate === (review.employeeId as unknown as AccountId)) return false;
  if (review.inputAuthorId && candidate === review.inputAuthorId) return false;
  if (review.contributorIds.includes(candidate)) return false;
  return true;
}

/** First eligible candidate from the pool, or null → caller emits blocked_sod. */
export function resolveApprover(
  review: ReviewView,
  candidatePool: readonly AccountId[],
): AccountId | null {
  for (const c of candidatePool) {
    if (isEligibleApprover(review, c)) return c;
  }
  return null;
}

/**
 * Fail-closed assertion used at finalize and admin-reassign — REJECTS an
 * ineligible approver server-side even when the UI hid the review from the queue.
 */
export function assertEligibleApprover(review: ReviewView, candidate: AccountId | null): void {
  if (!isEligibleApprover(review, candidate)) {
    fail(
      "ERR_SOD_INELIGIBLE",
      "Approver is the subject or a contributor of managerial input to this review.",
      403,
    );
  }
}
