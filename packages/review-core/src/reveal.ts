import type { NarrativeSections, ReviewView, SubjectProjection } from "./types.js";

/**
 * Reveal-before-lock (non-negotiable #3). The subject's ONLY status channel.
 *
 * - draft / in-review / flagged / blocked_sod / aborted  → display "in-review"
 *   (the subject is NEVER told it was flagged or that synthesis failed).
 * - narrative + rating are returned ONLY when revealed
 *   (status ∈ {awaiting-acknowledgement, locked}).
 *
 * `flaggedInternal` / flag reason / pre-reveal rating are NEVER serialized here.
 * Mirrors the SQL `subject_review_status` / `revealed_review` views.
 */
export function subjectReadProjection(
  review: ReviewView,
  finishedNarrative?: NarrativeSections,
): SubjectProjection {
  const revealed =
    review.status === "awaiting-acknowledgement" || review.status === "locked";

  const displayStatus: SubjectProjection["displayStatus"] =
    review.status === "awaiting-acknowledgement"
      ? "awaiting-acknowledgement"
      : review.status === "locked"
        ? "locked"
        : "in-review";

  const out: SubjectProjection = { reviewId: review.id, displayStatus };

  if (revealed && finishedNarrative) {
    out.narrative = finishedNarrative;
    if (review.rating) out.rating = review.rating;
  }
  return out;
}
