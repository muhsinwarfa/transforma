"use server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient, isRating } from "@transforma/db";
import { assertEligibleApprover, type ReviewView, TransformaError } from "@transforma/review-core";
import { requireRole } from "@/lib/auth/session";
import { createRlsClient } from "@/lib/supabase/server";

// append_audit is service-role-only; best-effort beside the RLS-gated mutation.
async function audit(companyId: string, action: string, actor: string, reviewId: string, target: object = {}) {
  try {
    await createServiceRoleClient()
      .schema("app")
      .rpc("append_audit", { p_company: companyId, p_action: action, p_actor: actor, p_review: reviewId, p_target: target });
  } catch {
    /* audit is best-effort here; the lock path (commit_lock) audits atomically */
  }
}

export async function setReviewRating(reviewId: string, rating: string) {
  const session = await requireRole("approver");
  if (!isRating(rating)) throw new Error("Invalid rating.");
  const supabase = await createRlsClient();
  // RLS (approver_id = current, status <> locked) gates this; pre-lock states only
  const { error } = await supabase.from("reviews").update({ rating }).eq("id", reviewId).in("status", ["in-review", "flagged"]);
  if (error) throw new Error(error.message);
  await audit(session.companyId, "rating_set", session.accountId, reviewId, { rating });
  revalidatePath(`/approvals/${reviewId}`);
}

export async function editDraftNarrative(reviewId: string, sections: Record<string, string>) {
  const session = await requireRole("approver");
  const supabase = await createRlsClient();

  // Rule 2 — no post-lock correction. The contract allows pre-lock revision at
  // the manager's discretion (PROC-05), so we only fail closed once LOCKED. (RLS
  // on review_drafts is keyed on approver-of, not review status, so this guard
  // is the one that rejects a locked-review draft edit.) The reviews row is only
  // visible here to its assigned approver; absence ⇒ not yours to edit.
  const { data: r } = await supabase.from("reviews").select("status").eq("id", reviewId).maybeSingle();
  if (!r) throw new TransformaError("ERR_FORBIDDEN", "Not your review to edit.", 403);
  if (r.status === "locked") throw new TransformaError("ERR_REVIEW_LOCKED", "Locked reviews are immutable.", 409);

  const { error } = await supabase
    .from("review_drafts")
    .update({ sections, edited_by_approver: true })
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  await audit(session.companyId, "narrative_edited", session.accountId, reviewId);
  revalidatePath(`/approvals/${reviewId}`);
}

/**
 * PROC-05 finalize → REVEAL (never lock). Fires the rating-required gate and the
 * SoD re-check (fail-closed, even though RLS returned only the approver's own
 * review), then transitions to `awaiting-acknowledgement` with the reveal + ack
 * window set. The permanent LOCK stays gated behind the subject's acknowledge/
 * respond path (or the window-close cron) — commit_lock, never here.
 */
export async function finalizeReview(reviewId: string) {
  const session = await requireRole("approver");
  const supabase = await createRlsClient();

  const { data: r } = await supabase
    .from("reviews")
    .select("employee_id, input_author_id, rating, status, cycle_id, review_contributors(contributor_account_id)")
    .eq("id", reviewId)
    .maybeSingle();
  if (!r) throw new TransformaError("ERR_FORBIDDEN", "Not your review to finalize.", 403);

  // fail-closed SoD re-check (catches a contributor not covered by the column CHECK)
  const review: ReviewView = {
    id: reviewId as ReviewView["id"],
    companyId: session.companyId as ReviewView["companyId"],
    cycleId: r.cycle_id as ReviewView["cycleId"],
    employeeId: r.employee_id as ReviewView["employeeId"],
    approverId: session.accountId as ReviewView["approverId"],
    inputAuthorId: (r.input_author_id as ReviewView["inputAuthorId"]) ?? null,
    contributorIds: ((r.review_contributors as { contributor_account_id: string }[] | null) ?? []).map(
      (c) => c.contributor_account_id as ReviewView["contributorIds"][number],
    ),
    status: r.status as ReviewView["status"],
    rating: (r.rating as ReviewView["rating"]) ?? null,
    reviewDraftId: null,
    flaggedInternal: false,
    revealedAt: null,
    ackWindowEndsAt: null,
  };
  assertEligibleApprover(review, review.approverId);

  if (!r.rating) throw new TransformaError("ERR_RATING_REQUIRED", "Set a rating before finalizing.", 409);

  const { data: ackDays } = await supabase.schema("app").rpc("effective_setting", {
    p_cycle: r.cycle_id,
    p_key: "ackWindowDays",
  });
  const days = ackDays ? Number.parseInt(ackDays as unknown as string, 10) || 7 : 7;
  const now = new Date();
  const ackEnds = new Date(now.getTime() + days * 86_400_000).toISOString();

  // REVEAL — transition to awaiting-acknowledgement (NOT locked). The transition
  // trigger validates the edge and requires revealed_at + ack_window_ends_at.
  const { error } = await supabase
    .from("reviews")
    .update({ status: "awaiting-acknowledgement", revealed_at: now.toISOString(), ack_window_ends_at: ackEnds })
    .eq("id", reviewId)
    .in("status", ["in-review", "flagged"]);
  if (error) throw new Error(error.message);

  await audit(session.companyId, "review_finalized", session.accountId, reviewId);
  await audit(session.companyId, "review_revealed", session.accountId, reviewId);
  revalidatePath("/approvals");
}
