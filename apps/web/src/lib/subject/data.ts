import "server-only";
import type { NarrativeSections } from "@transforma/review-core";
import { createRlsClient } from "@/lib/supabase/server";

export type SubjectDisplayStatus = "in-review" | "awaiting-acknowledgement" | "locked";

export interface MyReviewStatus {
  reviewId: string;
  displayStatus: SubjectDisplayStatus;
  revealedAt: string | null;
  ackWindowEndsAt: string | null;
}

export interface RevealedReview {
  reviewId: string;
  status: string;
  rating: string | null;
  narrative: NarrativeSections | null;
  lockedAt: string | null;
}

export interface MyResponse {
  outcome: string;
  body: string | null;
}

/**
 * The subject's ONLY status channel — the `subject_review_status` view returns
 * status only (flagged/draft/in-review/blocked_sod → "in-review"); RLS denies the
 * subject any direct read of reviews.narrative/rating/flagged. No narrative is
 * fetched here.
 */
export async function getMyReviewStatus(): Promise<MyReviewStatus | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("subject_review_status")
    .select("review_id, display_status, revealed_at, ack_window_ends_at")
    .maybeSingle();
  if (!data) return null;
  return {
    reviewId: data.review_id as string,
    displayStatus: data.display_status as SubjectDisplayStatus,
    revealedAt: data.revealed_at as string | null,
    ackWindowEndsAt: data.ack_window_ends_at as string | null,
  };
}

/**
 * The finished review — read ONLY through the reveal-gated `revealed_review`
 * view, which yields ZERO rows until status ∈ {awaiting-acknowledgement, locked}.
 * Callers must only invoke this once getMyReviewStatus() reports a revealed
 * status; even if called earlier, the view returns nothing (defence in depth).
 */
export async function getRevealedReview(): Promise<RevealedReview | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("revealed_review")
    .select("review_id, status, rating, narrative, locked_at")
    .maybeSingle();
  if (!data) return null;
  return {
    reviewId: data.review_id as string,
    status: data.status as string,
    rating: data.rating as string | null,
    narrative: (data.narrative as NarrativeSections | null) ?? null,
    lockedAt: data.locked_at as string | null,
  };
}

export async function getMyResponse(reviewId: string): Promise<MyResponse | null> {
  const supabase = await createRlsClient();
  const { data } = await supabase
    .from("employee_responses")
    .select("outcome, body")
    .eq("review_id", reviewId)
    .maybeSingle();
  return data ? { outcome: data.outcome as string, body: (data.body as string | null) ?? null } : null;
}
